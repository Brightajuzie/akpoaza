export function renderPrivacyPolicyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - FixMart</title>
  <style>
    :root {
      --primary: #22A45D;
      --primary-dark: #1B3D6E;
      --text: #1E293B;
      --text-muted: #64748B;
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --border: #E2E8F0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 32px 16px;
    }
    .container {
      max-width: 860px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 40px 32px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.04);
    }
    header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .badge {
      display: inline-block;
      background: #E8F5E9;
      color: var(--primary);
      font-weight: 700;
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 32px;
      color: var(--primary-dark);
      margin-bottom: 8px;
    }
    .meta {
      color: var(--text-muted);
      font-size: 14px;
    }
    h2 {
      font-size: 20px;
      color: var(--primary-dark);
      margin: 28px 0 12px 0;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    h3 {
      font-size: 16px;
      color: var(--text);
      margin: 16px 0 8px 0;
    }
    p { margin-bottom: 14px; }
    ul {
      margin: 12px 0 16px 24px;
    }
    li { margin-bottom: 8px; }
    .highlight-box {
      background: #F0FDF4;
      border-left: 4px solid var(--primary);
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .highlight-box strong { color: #065F46; }
    .contact-card {
      background: #F1F5F9;
      border-radius: 12px;
      padding: 20px;
      margin-top: 24px;
    }
    a { color: var(--primary); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    footer {
      margin-top: 40px;
      text-align: center;
      color: var(--text-muted);
      font-size: 13px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">Official Legal Document</span>
      <h1>Privacy Policy for FixMart</h1>
      <p class="meta">
        <strong>App Name:</strong> FixMart (Package: <code>com.akpoaza.kachlinks</code>)<br>
        <strong>Developer / Publisher:</strong> Akpoaza / Bright Ajuzie<br>
        <strong>Effective Date:</strong> September 24, 2026
      </p>
    </header>

    <div class="highlight-box">
      <strong>Summary:</strong> FixMart is committed to protecting your privacy. This Privacy Policy details how the FixMart mobile application and related services collect, use, disclose, and safeguard your personal information when you use our marketplace for ordering products, booking home service professionals, and requesting parcel deliveries.
    </div>

    <h2>1. Information We Collect</h2>
    <p>To provide and improve our marketplace and on-demand services, FixMart collects the following categories of information:</p>

    <h3>A. Personal Information You Provide</h3>
    <ul>
      <li><strong>Account Details:</strong> Full name, email address, phone number, physical address, and login credentials when you register as a Customer, Vendor, Handyman, or Delivery Rider.</li>
      <li><strong>Profile & KYC Verification Data:</strong> For service artisans and vendors, we collect government-issued identification documents, specialty certificates, and verification photographs to authenticate providers and protect consumers.</li>
      <li><strong>Order & Booking Details:</strong> Items purchased, service requests, delivery addresses, booking appointment schedules, and delivery recipient phone numbers.</li>
    </ul>

    <h3>B. Device & Permission-Based Data</h3>
    <ul>
      <li><strong>Location Data (Precise & Coarse):</strong> We collect your location information (via GPS, Wi-Fi, and network signals) when you use the app to:
        <ul>
          <li>Connect you with the closest qualified service professionals and handymen.</li>
          <li>Accurately determine product and parcel pickup and delivery addresses.</li>
          <li>Calculate trip distance and delivery fees.</li>
        </ul>
        Location data is only collected when the app is in active use or during an active order/delivery trip.
      </li>
      <li><strong>Camera & Photos / Media Storage:</strong> Used strictly with your permission to allow you to upload profile pictures, capture images for KYC identity verification, upload product catalog photos for vendors, and provide photo documentation of household maintenance issues.</li>
      <li><strong>Microphone / Audio:</strong> Used only when you initiate audio communications with customer support or service professionals within the application.</li>
      <li><strong>Biometric Authentication:</strong> If enabled on your device, biometric authentication (fingerprint / Face ID) is processed entirely locally by your device operating system for quick and secure sign-in. FixMart never collects, stores, or transmits your biometric raw data.</li>
    </ul>

    <h2>2. How We Use Your Information</h2>
    <p>We use the collected information for the following specific purposes:</p>
    <ul>
      <li>To process, fulfill, and deliver marketplace orders and parcel deliveries.</li>
      <li>To match clients with verified artisans, handymen, and riders in their geographic area.</li>
      <li>To send operational notifications, including order confirmations, booking updates, real-time dispatch alerts, and digital receipts.</li>
      <li>To verify service provider qualifications and prevent fraud or unauthorized activity on the platform.</li>
      <li>To process payments and manage escrow fund releases upon verified job completion.</li>
      <li>To provide customer support, dispute resolution, and platform maintenance.</li>
    </ul>

    <h2>3. Payment Processing & Financial Information</h2>
    <p>FixMart uses trusted, PCI-DSS compliant third-party payment gateways to process transactions securely:</p>
    <ul>
      <li><strong>Supported Gateways:</strong> Paystack, Flutterwave, Stripe, and OPay.</li>
      <li>FixMart <strong>does not</strong> store your full credit/debit card numbers, CVV codes, or banking passwords on our servers. All sensitive financial transaction details are processed directly and securely through the respective payment provider's encrypted tokenization system.</li>
    </ul>

    <h2>4. Third-Party Services & Data Sharing</h2>
    <p>We never sell your personal information. We only share information with third-party service providers necessary to operate the application:</p>
    <ul>
      <li><strong>Google Maps Platform:</strong> For geocoding addresses, rendering interactive maps, and calculating delivery routes.</li>
      <li><strong>Payment Processors:</strong> Paystack, Flutterwave, Stripe, and OPay for transaction authorization and settlement.</li>
      <li><strong>Service Providers & Delivery Riders:</strong> Assigned artisans or riders receive your name, contact phone number, and service/delivery location strictly for completing your requested task.</li>
      <li><strong>Legal Compliance:</strong> When required by applicable Nigerian or international laws, court orders, or governmental regulations.</li>
    </ul>

    <h2>5. Data Security & Storage</h2>
    <p>We employ industry-standard technical and organizational security measures to protect your information against unauthorized access, loss, or alteration. All communication between the FixMart mobile application and our servers is encrypted using Transport Layer Security (TLS/HTTPS). Stored data is hosted in secure, enterprise-grade cloud facilities with strict role-based access controls.</p>

    <h2>6. Data Retention & Account Deletion Policy</h2>
    <div class="highlight-box">
      <strong>Your Right to Delete Your Data:</strong> FixMart fully respects your right to control your personal information. You can request the permanent deletion of your account and all associated personal data at any time.
    </div>
    <p>To request deletion of your account and personal data:</p>
    <ul>
      <li><strong>Within the App:</strong> Go to <em>Profile Tab</em> &rarr; <em>Account Settings</em> &rarr; tap <em>Delete My Account</em>.</li>
      <li><strong>Web Request / Email:</strong> Visit our dedicated <a href="/account-deletion">Account Deletion Request Page</a> or send an email to <a href="mailto:support@fixmart.ng">support@fixmart.ng</a> with the subject line "Account Deletion Request" and your registered email address.</li>
    </ul>
    <p>Upon receiving your request, your account credentials and personal profile information will be permanently deleted from our active databases within thirty (30) days, except where retention is strictly required by financial auditing or legal compliance regulations.</p>

    <h2>7. Children's Privacy</h2>
    <p>FixMart does not knowingly collect or solicit personal information from children under the age of 18. If we learn that we have inadvertently collected information from a child under 18 without parental consent, we will promptly delete that data from our systems.</p>

    <h2>8. Changes to this Privacy Policy</h2>
    <p>We may update this Privacy Policy from time to time to reflect operational or legal changes. We will notify you of any material updates by updating the "Effective Date" at the top of this document and publishing the latest version directly at this URL.</p>

    <div class="contact-card">
      <h2 style="margin-top:0; border:none; padding:0;">9. Contact Us</h2>
      <p>If you have any questions, feedback, or concerns regarding this Privacy Policy or your personal information, please contact our data privacy officer at:</p>
      <p>
        <strong>FixMart / Akpoaza</strong><br>
        <strong>Email:</strong> <a href="mailto:support@fixmart.ng">support@fixmart.ng</a> / <a href="mailto:privacy@fixmart.ng">privacy@fixmart.ng</a><br>
        <strong>Publisher:</strong> Bright Ajuzie<br>
        <strong>Location:</strong> Nigeria<br>
        <strong>Website:</strong> <a href="https://akpoaza-3.onrender.com">https://akpoaza-3.onrender.com</a>
      </p>
    </div>

    <footer>
      &copy; 2026 FixMart (Akpoaza). All Rights Reserved. | <a href="/account-deletion">Account Deletion</a>
    </footer>
  </div>
</body>
</html>`;
}

export function renderAccountDeletionHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account & Data Deletion - FixMart</title>
  <style>
    :root {
      --primary: #22A45D;
      --primary-dark: #1B3D6E;
      --text: #1E293B;
      --text-muted: #64748B;
      --bg: #F8FAFC;
      --card-bg: #FFFFFF;
      --border: #E2E8F0;
      --danger: #EF4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 32px 16px;
    }
    .container {
      max-width: 760px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 40px 32px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.04);
    }
    h1 {
      font-size: 28px;
      color: var(--primary-dark);
      margin-bottom: 8px;
    }
    p { margin-bottom: 14px; }
    .alert-box {
      background: #FEF2F2;
      border-left: 4px solid var(--danger);
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
      color: #991B1B;
    }
    ol, ul {
      margin: 12px 0 18px 24px;
    }
    li { margin-bottom: 10px; }
    .card {
      background: #F1F5F9;
      border-radius: 12px;
      padding: 24px;
      margin: 24px 0;
    }
    .btn {
      display: inline-block;
      background: var(--primary);
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 700;
      text-decoration: none;
      margin-top: 10px;
    }
    a { color: var(--primary); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>FixMart Account & Data Deletion Request</h1>
    <p>In compliance with Google Play Developer Program policies and global data protection standards, FixMart users have the right to request the permanent deletion of their account and associated personal data.</p>

    <div class="alert-box">
      <strong>Important:</strong> Deleting your account is permanent. All saved profile information, addresses, active booking histories, loyalty rewards, and vendor catalogs associated with your account will be permanently erased and cannot be restored.
    </div>

    <h2>How to Request Account Deletion</h2>
    <p>You can delete your account using either of the following methods:</p>

    <div class="card">
      <h3 style="margin-bottom:10px; color:var(--primary-dark);">Option 1: In-App Deletion (Instant)</h3>
      <ol>
        <li>Open the <strong>FixMart</strong> app on your Android or iOS device.</li>
        <li>Tap the <strong>Profile</strong> tab in the navigation bar.</li>
        <li>Select <strong>Account Settings</strong>.</li>
        <li>Tap <strong>Delete Account</strong> at the bottom of the page.</li>
        <li>Confirm your selection when prompted.</li>
      </ol>
    </div>

    <div class="card">
      <h3 style="margin-bottom:10px; color:var(--primary-dark);">Option 2: Direct Email Request</h3>
      <p>If you have uninstalled the app or cannot log in, email our support team directly:</p>
      <ul>
        <li>Send an email to: <a href="mailto:support@fixmart.ng">support@fixmart.ng</a> or <a href="mailto:brightajuzie@gmail.com">brightajuzie@gmail.com</a></li>
        <li>Subject: <code>Account Deletion Request - [Your Registered Email]</code></li>
        <li>Provide your full name and registered phone number for verification.</li>
      </ul>
      <p>Our team will process and complete your account and data deletion within 7 to 14 business days, and send a confirmation to your email address.</p>
    </div>

    <h2>What Data Is Deleted</h2>
    <ul>
      <li>Your personal profile (Name, Email, Phone, Address, Profile photo).</li>
      <li>Vendor products and artisan profile listings.</li>
      <li>Push notification tokens and device identifiers.</li>
      <li>Stored communication preferences.</li>
    </ul>

    <h2>What Data Is Retained (If Any)</h2>
    <p>Certain historical financial and transaction logs may be retained in an anonymized format for the minimum period legally required by Nigerian financial and tax regulations.</p>

    <p style="margin-top:30px;"><a href="/privacy-policy">&larr; Return to FixMart Privacy Policy</a></p>
  </div>
</body>
</html>`;
}
