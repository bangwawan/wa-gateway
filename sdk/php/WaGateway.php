<?php

/**
 * WhatsApp Gateway API SDK for PHP
 * 
 * Simple wrapper for wa-gateway REST API using native cURL.
 */
class WaGateway
{
    /** @var string Base URL for the API */
    private $baseUrl;

    /** @var string|null JWT Token for Bearer auth */
    private $token;

    /** @var string|null API Key for x-api-key auth */
    private $apiKey;

    /**
     * WaGateway Constructor
     * 
     * @param string $baseUrl Base URL of the WA Gateway (e.g., http://localhost:3000)
     */
    public function __construct($baseUrl = 'http://localhost:3000')
    {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    /**
     * Set JWT Token for authentication
     * 
     * @param string $token
     * @return self
     */
    public function setToken($token)
    {
        $this->token = $token;
        return $this;
    }

    /**
     * Set API Key for authentication
     * 
     * @param string $apiKey
     * @return self
     */
    public function setApiKey($apiKey)
    {
        $this->apiKey = $apiKey;
        return $this;
    }

    /**
     * Helper to perform HTTP requests using cURL
     * 
     * @param string $method HTTP method (GET, POST, DELETE, etc.)
     * @param string $path API endpoint path
     * @param mixed $data Request body data or query parameters
     * @param bool $isMultipart Set to true if sending multipart/form-data
     * @return array Decoded JSON response
     * @throws Exception On cURL error
     */
    private function request($method, $path, $data = null, $isMultipart = false)
    {
        $url = $this->baseUrl . $path;
        $headers = [];

        if ($this->token) {
            $headers[] = 'Authorization: Bearer ' . $this->token;
        }
        if ($this->apiKey) {
            $headers[] = 'x-api-key: ' . $this->apiKey;
        }

        $ch = curl_init();
        
        if ($method === 'GET' && $data) {
            $url .= '?' . http_build_query($data);
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        if ($method !== 'GET' && $data !== null) {
            if ($isMultipart) {
                // cURL handles multipart automatically when given an array
                curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
            } else {
                $headers[] = 'Content-Type: application/json';
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            }
        }

        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $response = curl_exec($ch);
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($error) {
            throw new Exception("cURL Error: $error");
        }

        $decoded = json_decode($response, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }

        return ['success' => false, 'message' => 'Invalid JSON response', 'raw' => $response, 'statusCode' => $httpCode];
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    /**
     * Register a new user
     * 
     * @param string $name User name
     * @param string $email User email
     * @param string $password User password
     * @param string $role User role (ADMIN or USER)
     * @return array
     */
    public function register($name, $email, $password, $role = 'USER')
    {
        return $this->request('POST', '/auth/register', [
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'role' => $role
        ]);
    }

    /**
     * Login and get JWT token
     * 
     * @param string $email User email
     * @param string $password User password
     * @return array
     */
    public function login($email, $password)
    {
        return $this->request('POST', '/auth/login', [
            'email' => $email,
            'password' => $password
        ]);
    }

    /**
     * Get profile of currently logged-in user
     * 
     * @return array
     */
    public function getMe()
    {
        return $this->request('GET', '/auth/me');
    }

    /**
     * Get WhatsApp QR Code (Admin only)
     * 
     * @return array
     */
    public function getQr()
    {
        return $this->request('GET', '/auth/qr');
    }

    /**
     * Get WhatsApp connection status
     * 
     * @return array
     */
    public function getWaStatus()
    {
        return $this->request('GET', '/auth/wa-status');
    }

    // ==========================================
    // MESSAGES
    // ==========================================

    /**
     * Send a text message
     * 
     * @param string $to Destination WA number (format E.164 without +)
     * @param string $content Message text
     * @return array
     */
    public function sendTextMessage($to, $content)
    {
        return $this->request('POST', '/messages', [
            'to' => $to,
            'content' => $content
        ]);
    }

    /**
     * Send a media message
     * 
     * @param string $to Destination WA number
     * @param string $filePath Absolute path to the file
     * @param string|null $caption Optional caption
     * @return array
     */
    public function sendMediaMessage($to, $filePath, $caption = null)
    {
        if (!file_exists($filePath)) {
            throw new Exception("File not found: $filePath");
        }

        $data = [
            'to' => $to,
            'media' => new CURLFile($filePath)
        ];
        
        if ($caption !== null) {
            $data['caption'] = $caption;
        }

        return $this->request('POST', '/messages', $data, true);
    }

    /**
     * List all messages with filters
     * 
     * @param array $filters Query parameters (page, limit, direction, status, from, to, startDate, endDate)
     * @return array
     */
    public function getMessages($filters = [])
    {
        return $this->request('GET', '/messages', $filters);
    }

    /**
     * Get message details by ID
     * 
     * @param string $id Message UUID
     * @return array
     */
    public function getMessage($id)
    {
        return $this->request('GET', '/messages/' . urlencode($id));
    }

    /**
     * Delete a message (only if status is completed/failed)
     * 
     * @param string $id Message UUID
     * @return array
     */
    public function deleteMessage($id)
    {
        return $this->request('DELETE', '/messages/' . urlencode($id));
    }

    // ==========================================
    // REPORTS
    // ==========================================

    /**
     * Get message statistics summary
     * 
     * @param string|null $startDate Date format YYYY-MM-DD
     * @param string|null $endDate Date format YYYY-MM-DD
     * @return array
     */
    public function getReportsSummary($startDate = null, $endDate = null)
    {
        $query = [];
        if ($startDate) $query['startDate'] = $startDate;
        if ($endDate) $query['endDate'] = $endDate;
        return $this->request('GET', '/reports/summary', $query);
    }

    /**
     * Get daily message data (for charts)
     * 
     * @param int $days Number of days back (default: 7)
     * @return array
     */
    public function getReportsDaily($days = 7)
    {
        return $this->request('GET', '/reports/daily', ['days' => $days]);
    }

    /**
     * Get list of failed messages
     * 
     * @param int $page
     * @param int $limit
     * @return array
     */
    public function getReportsFailed($page = 1, $limit = 20)
    {
        return $this->request('GET', '/reports/failed', [
            'page' => $page,
            'limit' => $limit
        ]);
    }

    // ==========================================
    // STATUS
    // ==========================================

    /**
     * Get server health check status
     * 
     * @return array
     */
    public function getStatus()
    {
        return $this->request('GET', '/status');
    }
}
