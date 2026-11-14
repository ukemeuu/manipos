<?php
/**
 * Pot of Jollof - WhatsApp Cloud API Direct Webhook
 * Zero 3rd-party SaaS fees - Direct Meta Cloud API integration.
 */

header('Content-Type: application/json; charset=utf-8');

// ─────────────────────────────────────────────────────────────
// CONFIGURATION (prefer server environment variables in production)
// ─────────────────────────────────────────────────────────────
// 1. Verify token: Set the same secret token in your Meta App Webhook settings
define('VERIFY_TOKEN', getenv('WHATSAPP_VERIFY_TOKEN') ?: 'POJ_WHATSAPP_SECRET_2026');

// 2. Meta App Secret (strongly recommended for X-Hub-Signature-256 verification)
define('APP_SECRET', getenv('WHATSAPP_APP_SECRET') ?: '');

// 3. Phone Number ID: Available on Meta WhatsApp > API Setup screen
define('PHONE_NUMBER_ID', getenv('WHATSAPP_PHONE_NUMBER_ID') ?: 'YOUR_PHONE_NUMBER_ID');

// 4. Permanent Access Token: Generated from Meta Business System User
define('ACCESS_TOKEN', getenv('WHATSAPP_ACCESS_TOKEN') ?: 'YOUR_META_PERMANENT_ACCESS_TOKEN');

// 5. Tenant presentation overrides (defaulting to Pot of Jollof)
define('STORE_NAME', getenv('WHATSAPP_STORE_NAME') ?: 'Pot of Jollof');
define('STORE_MENU_URL', getenv('WHATSAPP_STORE_MENU_URL') ?: 'https://potofjollof.manipos.com');
define('SUPPORT_PHONE', getenv('WHATSAPP_SUPPORT_PHONE') ?: '0795384140');

// ─────────────────────────────────────────────────────────────
// 1. WEBHOOK VERIFICATION (GET request from Meta)
// ─────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // PHP converts query parameter dots to underscores, but check both
    $mode = $_GET['hub_mode'] ?? ($_GET['hub.mode'] ?? '');
    $token = $_GET['hub_verify_token'] ?? ($_GET['hub.verify_token'] ?? '');
    $challenge = $_GET['hub_challenge'] ?? ($_GET['hub.challenge'] ?? '');

    if ($mode === 'subscribe' && $token === VERIFY_TOKEN) {
        http_response_code(200);
        echo $challenge;
        exit;
    }

    http_response_code(403);
    echo json_encode(['error' => 'Verification token mismatch']);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 2. INCOMING WEBHOOK HANDLER (POST request from Meta)
// ─────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');

    // Verify Meta X-Hub-Signature-256 when WHATSAPP_APP_SECRET is configured
    if (APP_SECRET !== '') {
        $signatureHeader = $_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '';
        $expectedSignature = 'sha256=' . hash_hmac('sha256', $rawInput, APP_SECRET);
        if (!is_string($signatureHeader) || !hash_equals($expectedSignature, $signatureHeader)) {
            http_response_code(403);
            echo json_encode(['error' => 'Invalid webhook signature']);
            exit;
        }
    }

    $data = json_decode($rawInput, true);

    // Immediately respond 200 OK to Meta
    http_response_code(200);
    echo json_encode(['status' => 'received']);

    if (!$data || !isset($data['entry'])) {
        exit;
    }

    // Process incoming message
    foreach ($data['entry'] as $entry) {
        $changes = $entry['changes'] ?? [];
        foreach ($changes as $change) {
            $value = $change['value'] ?? [];
            $messages = $value['messages'] ?? [];
            $contacts = $value['contacts'] ?? [];
            $phoneId = $value['metadata']['phone_number_id'] ?? PHONE_NUMBER_ID;

            if (empty($messages)) {
                continue;
            }

            foreach ($messages as $message) {
                $from = $message['from'] ?? ''; // Customer phone e.g. 254712345678
                $msgType = $message['type'] ?? '';
                $senderName = $contacts[0]['profile']['name'] ?? 'Guest';

                $userInput = '';

                if ($msgType === 'text') {
                    $userInput = trim(strtolower($message['text']['body'] ?? ''));
                } elseif ($msgType === 'interactive') {
                    // Quick reply button tap
                    $userInput = trim(strtolower($message['interactive']['button_reply']['id'] ?? ''));
                }

                // Route based on customer choice
                handleUserSelection($from, $userInput, $senderName, $phoneId);
            }
        }
    }
    exit;
}

// ─────────────────────────────────────────────────────────────
// 3. LOGIC ROUTER
// ─────────────────────────────────────────────────────────────
function handleUserSelection($recipientPhone, $input, $customerName, $phoneId) {
    if (empty($recipientPhone)) return;

    // OPTION 1: Place New Order
    if ($input === '1' || $input === 'opt_new_order' || strpos($input, 'order') !== false || strpos($input, 'menu') !== false) {
        $msg = "🍲 *Order from " . STORE_NAME . "*\n\n"
             . "You can view our live digital menu, customize your dishes, and place your order directly here:\n\n"
             . "👉 *" . STORE_MENU_URL . "*\n\n"
             . "⚡ Fast delivery & takeaway available!\n\n"
             . "_(Reply with *2* if you are following up on an existing order)_";
        
        sendWhatsAppText($recipientPhone, $msg, $phoneId);
        return;
    }

    // OPTION 2: Follow Up on Existing Order
    if ($input === '2' || $input === 'opt_existing_order' || strpos($input, 'status') !== false || strpos($input, 'follow up') !== false || strpos($input, 'existing') !== false) {
        $msg = "📞 *Following Up on an Existing Order*\n\n"
             . "For live updates on your preparation or rider dispatch, please call our kitchen directly:\n\n"
             . "☎️ *" . SUPPORT_PHONE . "*\n\n"
             . "Our dispatch team is on standby to assist you!\n\n"
             . "_(Reply with *1* to place a new order)_";

        sendWhatsAppText($recipientPhone, $msg, $phoneId);
        return;
    }

    // DEFAULT GREETING: Send Interactive 1-tap Buttons
    sendInteractiveMenu($recipientPhone, $customerName, $phoneId);
}

// ─────────────────────────────────────────────────────────────
// 4. META CLOUD API SENDER HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Sends welcome message with 2 native 1-tap buttons
 */
function sendInteractiveMenu($to, $name, $phoneId) {
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => 'interactive',
        'interactive' => [
            'type' => 'button',
            'header' => [
                'type' => 'text',
                'text' => STORE_NAME . ' Kitchen 🍲'
            ],
            'body' => [
                'text' => "Hello {$name}! Welcome to " . STORE_NAME . ".\n\nHow can we help you today? Tap an option below:"
            ],
            'footer' => [
                'text' => 'Or reply with 1 or 2'
            ],
            'action' => [
                'buttons' => [
                    [
                        'type' => 'reply',
                        'reply' => [
                            'id' => 'opt_new_order',
                            'title' => '1️⃣ Place New Order'
                        ]
                    ],
                    [
                        'type' => 'reply',
                        'reply' => [
                            'id' => 'opt_existing_order',
                            'title' => '2️⃣ Existing Order'
                        ]
                    ]
                ]
            ]
        ]
    ];

    callMetaApi($payload, $phoneId);
}

/**
 * Sends plain text WhatsApp message
 */
function sendWhatsAppText($to, $text, $phoneId) {
    $payload = [
        'messaging_product' => 'whatsapp',
        'recipient_type' => 'individual',
        'to' => $to,
        'type' => 'text',
        'text' => [
            'preview_url' => true,
            'body' => $text
        ]
    ];

    callMetaApi($payload, $phoneId);
}

/**
 * Sends cURL POST request to Meta Graph API
 */
function callMetaApi($payload, $phoneId) {
    $url = "https://graph.facebook.com/v20.0/{$phoneId}/messages";

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . ACCESS_TOKEN,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['code' => $httpCode, 'response' => $response];
}
