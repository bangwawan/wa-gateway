const WaGateway = require('./WaGateway');

async function runExample() {
    // Initialize SDK
    const wa = new WaGateway('http://localhost:3000');

    // Example 1: Use API Key
    wa.setApiKey('YOUR_API_KEY_HERE');

    try {
        console.log("Checking Server Status...");
        const status = await wa.getStatus();
        console.log(status);

        console.log("\nSending Message...");
        const response = await wa.sendTextMessage('6281234567890', 'Hello from JS SDK!');
        console.log(response);

        // Example 2: Login flow (uncomment to test)
        /*
        const loginResponse = await wa.login('admin@example.com', 'password123');
        if (loginResponse.success && loginResponse.data && loginResponse.data.token) {
            wa.setToken(loginResponse.data.token);
            const waStatus = await wa.getWaStatus();
            console.log(waStatus);
        }
        */

    } catch (error) {
        console.error("Error:", error.message);
    }
}

runExample();
