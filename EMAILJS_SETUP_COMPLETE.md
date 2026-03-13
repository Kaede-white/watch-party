# EmailJS Complete Setup Guide

## Step 1: Add Your Email Service

1. Go to https://dashboard.emailjs.com/admin
2. Click **"Email Services"** in the left sidebar
3. Click **"Add New Service"**
4. Choose **Gmail** (or your email provider)
5. Click **"Connect Account"** and sign in with your Gmail
6. Once connected, you'll see your **Service ID** (service_wyvae0m)

```
┌─────────────────────────────────────┐
│  Email Services                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  Gmail                      │   │
│  │  service_wyvae0m  ← COPY    │   │
│  │  ● Connected                │   │
│  └─────────────────────────────┘   │
│                                     │
│  [+ Add New Service]                │
└─────────────────────────────────────┘
```

## Step 2: Create Email Template

1. Click **"Email Templates"** in left sidebar
2. Click **"Create New Template"**
3. Choose **"Blank"** template
4. Set **Template Name**: `Booking Confirmation`
5. Set **Template ID**: `template_qgld02c` (must match exactly!)

### Template Settings:

**Subject:**
```
Booking Confirmed - {{service}} | The Gentleman's Cut
```

**To Email:**
```
{{to_email}}
```

**From Name:**
```
The Gentleman's Cut
```

**From Email:**
```
{{from_email}}
```

**Reply To:**
```
kaederivera11@gmail.com
```

### Email Content (HTML):**

```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #8b7355; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
        .details { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        .button { background: #c9a86c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Booking Confirmed!</h1>
            <p>The Gentleman's Cut</p>
        </div>
        
        <div class="content">
            <p>Hello {{to_name}},</p>
            
            <p>Your appointment has been successfully scheduled. We look forward to seeing you!</p>
            
            <div class="details">
                <h3>Appointment Details</h3>
                <div class="detail-row">
                    <strong>Service:</strong>
                    <span>{{service}}</span>
                </div>
                <div class="detail-row">
                    <strong>Date:</strong>
                    <span>{{date}}</span>
                </div>
                <div class="detail-row">
                    <strong>Time:</strong>
                    <span>{{time}}</span>
                </div>
                <div class="detail-row">
                    <strong>Booking ID:</strong>
                    <span>{{booking_id}}</span>
                </div>
                <div class="detail-row">
                    <strong>Phone:</strong>
                    <span>{{phone}}</span>
                </div>
                {{#if notes}}
                <div class="detail-row">
                    <strong>Special Requests:</strong>
                    <span>{{notes}}</span>
                </div>
                {{/if}}
            </div>
            
            <div class="details">
                <h3>Location</h3>
                <p>
                    📍 {{shop_address}}<br>
                    📞 {{shop_phone}}
                </p>
            </div>
            
            <p style="text-align: center;">
                <a href="tel:{{shop_phone}}" class="button">Call to Reschedule</a>
            </p>
            
            <p><strong>Important:</strong> Please arrive 5 minutes early. If you need to cancel or reschedule, please call us at least 2 hours in advance.</p>
        </div>
        
        <div class="footer">
            <p>Thank you for choosing The Gentleman's Cut</p>
            <p>© 2025 The Gentleman's Cut. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
```

6. Click **"Save"**

## Step 3: Get Your Public Key

1. Click **"Account"** in the left sidebar (or your profile picture)
2. Go to **"API Keys"** tab
3. Copy the **Public Key** (looks like: `IzLtdm1YSEIopEEcZ`)

```
┌─────────────────────────────────────┐
│  Account Settings                   │
│                                     │
│  [General] [API Keys] [Security]    │
│                                     │
│  API Keys                           │
│  ─────────────────────────────────  │
│                                     │
│  Public Key:                        │
│  ┌──────────────────────────────┐  │
│  │ IzLtdm1YSEIopEEcZ     [Copy]│  │
│  └──────────────────────────────┘  │
│                                     │
│  Private Key: (keep secret!)        │
└─────────────────────────────────────┘
```

## Step 4: Update Your Config

Your `src/config/emailjs.ts` should look like this:

```typescript
export const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_wyvae0m',
  TEMPLATE_ID: 'template_qgld02c',
  PUBLIC_KEY: 'IzLtdm1YSEIopEEcZ',
  ADMIN_EMAIL: 'kaederivera11@gmail.com'
}
```

## Step 5: Test Your Setup

1. Run your app: `npm run dev`
2. Open the booking modal
3. Fill in the form with YOUR email address
4. Submit
5. Check your email inbox (and spam folder) for the confirmation

## Troubleshooting

### Email not received?
- Check spam/junk folder
- Verify template ID matches exactly
- Check EmailJS dashboard for sending errors
- Make sure Gmail service is connected properly

### "Service not found" error?
- Verify SERVICE_ID is correct
- Make sure service is active (not paused)

### Template variables not showing?
- Use `{{variable_name}}` format in template
- Ensure variable names match what the code sends

## Variables Used in Template

| Variable | Description |
|----------|-------------|
| `{{to_name}}` | Customer's full name |
| `{{to_email}}` | Customer's email address |
| `{{service}}` | Selected service name |
| `{{date}}` | Appointment date |
| `{{time}}` | Appointment time |
| `{{phone}}` | Customer's phone number |
| `{{notes}}` | Special requests |
| `{{booking_id}}` | Unique booking reference |
| `{{shop_address}}` | Your shop address |
| `{{shop_phone}}` | Your shop phone number |
| `{{from_email}}` | Sender email (your Gmail) |

## Need Help?

EmailJS Documentation: https://www.emailjs.com/docs/
Support: https://www.emailjs.com/contact-us/
