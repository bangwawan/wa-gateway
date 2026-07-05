<?php

require_once 'WaGateway.php';

// Initialize SDK
$wa = new WaGateway('http://localhost:3000');

// Example 1: Use API Key
$wa->setApiKey('YOUR_API_KEY_HERE');

try {
    // Check Status
    echo "Checking Server Status...\n";
    $status = $wa->getStatus();
    print_r($status);

    // Send a message
    echo "\nSending Message...\n";
    $response = $wa->sendTextMessage('6281234567890', 'Hello from PHP SDK!');
    print_r($response);

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

// Example 2: Use JWT Token (Login flow)
/*
try {
    $login = $wa->login('admin@example.com', 'password123');
    if ($login['success'] && isset($login['data']['token'])) {
        $wa->setToken($login['data']['token']);
        
        // Get WhatsApp Status
        $waStatus = $wa->getWaStatus();
        print_r($waStatus);
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
*/
