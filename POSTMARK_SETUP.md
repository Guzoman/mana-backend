# Postmark Setup Guide for manaproject.app

## 1. Create Postmark Account
- Go to https://postmarkapp.com
- Sign up and create new Server for "manaproject.app"

## 2. Verify Domain (DNS in Cloudflare)
Add these DNS records in Cloudflare:

### CNAME Record:
- Type: CNAME  
- Name: pm-bounces
- Value: [Get from Postmark domain verification]

### TXT Record (DKIM):
- Type: TXT
- Name: manaproject.app  
- Value: [DKIM signature from Postmark]

## 3. Configuration
- Server API Token: [Copy from Postmark dashboard]
- From Address: noreply@manaproject.app
- Reply-To: support@manaproject.app

## 4. Environment Variables
Add to .env:
```
POSTMARK_API_TOKEN=your_api_token_here
POSTMARK_FROM_EMAIL=noreply@manaproject.app
```

## 5. Test Email
Use Postmark dashboard to send test email and verify delivery.
