/**
 * WhatsApp Gateway API SDK for JavaScript
 * 
 * Simple wrapper for wa-gateway REST API using native fetch.
 * Compatible with Node.js (18+) and modern browsers.
 */
class WaGateway {
    /**
     * WaGateway Constructor
     * 
     * @param {string} [baseUrl='http://localhost:3000'] Base URL of the WA Gateway
     */
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.token = null;
        this.apiKey = null;
    }

    /**
     * Set JWT Token for authentication
     * 
     * @param {string} token 
     * @returns {WaGateway}
     */
    setToken(token) {
        this.token = token;
        return this;
    }

    /**
     * Set API Key for authentication
     * 
     * @param {string} apiKey 
     * @returns {WaGateway}
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        return this;
    }

    /**
     * Internal helper to perform HTTP requests
     * 
     * @param {string} method HTTP Method (GET, POST, etc.)
     * @param {string} path API endpoint path
     * @param {Object} [data] Request body or query params
     * @param {boolean} [isMultipart=false] Set to true if using FormData
     * @returns {Promise<Object>} JSON response
     * @throws {Error} If fetch fails
     */
    async _request(method, path, data = null, isMultipart = false) {
        let url = `${this.baseUrl}${path}`;
        const headers = {};

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }

        const options = {
            method,
            headers
        };

        if (method === 'GET' && data) {
            const params = new URLSearchParams(data).toString();
            url += `?${params}`;
        } else if (method !== 'GET' && data !== null) {
            if (isMultipart) {
                // When sending FormData with fetch, do NOT set Content-Type header.
                // The browser/Node will set it automatically with the correct boundary.
                options.body = data;
            } else {
                headers['Content-Type'] = 'application/json';
                options.body = JSON.stringify(data);
            }
        }

        try {
            const response = await fetch(url, options);
            const contentType = response.headers.get('content-type');
            
            let json = null;
            if (contentType && contentType.includes('application/json')) {
                json = await response.json();
            } else {
                const text = await response.text();
                return { success: false, message: 'Non-JSON response', raw: text, statusCode: response.status };
            }

            if (!response.ok && !json) {
                return { success: false, message: `HTTP Error ${response.status}`, statusCode: response.status };
            }

            return json;
        } catch (error) {
            throw new Error(`WaGateway request failed: ${error.message}`);
        }
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    /**
     * Register a new user
     * 
     * @param {string} name User name
     * @param {string} email User email
     * @param {string} password User password
     * @param {string} [role='USER'] User role (ADMIN or USER)
     * @returns {Promise<Object>}
     */
    async register(name, email, password, role = 'USER') {
        return this._request('POST', '/auth/register', { name, email, password, role });
    }

    /**
     * Login and get JWT token
     * 
     * @param {string} email User email
     * @param {string} password User password
     * @returns {Promise<Object>}
     */
    async login(email, password) {
        return this._request('POST', '/auth/login', { email, password });
    }

    /**
     * Get profile of currently logged-in user
     * 
     * @returns {Promise<Object>}
     */
    async getMe() {
        return this._request('GET', '/auth/me');
    }

    /**
     * Get WhatsApp QR Code (Admin only)
     * 
     * @returns {Promise<Object>}
     */
    async getQr() {
        return this._request('GET', '/auth/qr');
    }

    /**
     * Get WhatsApp connection status
     * 
     * @returns {Promise<Object>}
     */
    async getWaStatus() {
        return this._request('GET', '/auth/wa-status');
    }

    // ==========================================
    // MESSAGES
    // ==========================================

    /**
     * Send a text message
     * 
     * @param {string} to Destination WA number (format E.164 without +)
     * @param {string} content Message text
     * @returns {Promise<Object>}
     */
    async sendTextMessage(to, content) {
        return this._request('POST', '/messages', { to, content });
    }

    /**
     * Send a media message.
     * Note: In Node.js, you might need to construct a FormData object manually
     * or pass a Blob/File depending on your environment.
     * 
     * @param {string} to Destination WA number
     * @param {FormData} formData A FormData object containing the 'media' and 'caption'
     * @returns {Promise<Object>}
     */
    async sendMediaMessage(to, formData) {
        formData.append('to', to);
        return this._request('POST', '/messages', formData, true);
    }

    /**
     * List all messages with filters
     * 
     * @param {Object} [filters={}] Query parameters (page, limit, direction, status, etc.)
     * @returns {Promise<Object>}
     */
    async getMessages(filters = {}) {
        return this._request('GET', '/messages', filters);
    }

    /**
     * Get message details by ID
     * 
     * @param {string} id Message UUID
     * @returns {Promise<Object>}
     */
    async getMessage(id) {
        return this._request('GET', `/messages/${encodeURIComponent(id)}`);
    }

    /**
     * Delete a message (only if status is completed/failed)
     * 
     * @param {string} id Message UUID
     * @returns {Promise<Object>}
     */
    async deleteMessage(id) {
        return this._request('DELETE', `/messages/${encodeURIComponent(id)}`);
    }

    // ==========================================
    // REPORTS
    // ==========================================

    /**
     * Get message statistics summary
     * 
     * @param {string} [startDate] Date format YYYY-MM-DD
     * @param {string} [endDate] Date format YYYY-MM-DD
     * @returns {Promise<Object>}
     */
    async getReportsSummary(startDate = null, endDate = null) {
        const query = {};
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;
        return this._request('GET', '/reports/summary', query);
    }

    /**
     * Get daily message data (for charts)
     * 
     * @param {number} [days=7] Number of days back
     * @returns {Promise<Object>}
     */
    async getReportsDaily(days = 7) {
        return this._request('GET', '/reports/daily', { days });
    }

    /**
     * Get list of failed messages
     * 
     * @param {number} [page=1] 
     * @param {number} [limit=20] 
     * @returns {Promise<Object>}
     */
    async getReportsFailed(page = 1, limit = 20) {
        return this._request('GET', '/reports/failed', { page, limit });
    }

    // ==========================================
    // STATUS
    // ==========================================

    /**
     * Get server health check status
     * 
     * @returns {Promise<Object>}
     */
    async getStatus() {
        return this._request('GET', '/status');
    }
}

// Export for Node.js / ES6
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = WaGateway;
} else if (typeof window !== 'undefined') {
    window.WaGateway = WaGateway;
}
