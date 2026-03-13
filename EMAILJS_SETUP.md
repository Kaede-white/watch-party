# EmailJS Setup Guide

To enable real-time email confirmations for your barbershop booking system, follow these steps:

## 1. Create an EmailJS Account

1. Go to [https://www.emailjs.com/](https://www.emailjs.com/)
2. Sign up for a free account
3. The free plan includes 200 emails per month

## 2. Add an Email Service

1. In your EmailJS dashboard, go to **Email Services**
2. Click **Add New Service**
3. Choose your email provider (Gmail, Outlook, Yahoo, etc.)
4. Follow the authentication steps
5. Copy the **Service ID** (e.g., `service_abc123`)

## 3. Create an Email Template

1. Go to **Email Templates**
2. Click **Create New Template**
3. Use the following template structure:

### Template for Customer Confirmation:
```html
Subject: Booking Confirmed - {{service}}

Hello {{to_name}},

Your appointment has been confirmed!

**Booking Details:**
- Service: {{service}}
- Date: {{date}}
- Time: {{time}}
- Booking Reference: {{booking_id}}

**Location:**
{{shop_address}}
Phone: {{shop_phone}}

**Important Notes:**
{{notes}}

We look forward to seeing you! If you need to reschedule, please call us at {{shop_phone}} or reply to this email.

Best regards,
The Gentleman's Cut Team
```

4. Copy the **Template ID** (e.g., `template_xyz789`)

## 4. Get Your Public Key

1. Go to **Account** > **General**
2. Copy your **Public Key**

## 5. Update the Configuration

Open `src/App.tsx` and update the `EMAILJS_CONFIG` object (around line 35):

```typescript
const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_your_actual_service_id',  // Replace with your Service ID
  TEMPLATE_ID: 'template_your_actual_template_id', // Replace with your Template ID
  PUBLIC_KEY: 'your_actual_public_key',           // Replace with your Public Key
  ADMIN_EMAIL: 'your-email@example.com'           // Replace with your barbershop email
}
```

## 6. Test Your Setup

1. Run the development server: `npm run dev`
2. Open the booking modal
3. Fill in the form with a real email address
4. Submit the booking
5. Check your email inbox for the confirmation

## Template Variables Available

Use these variables in your EmailJS template:

- `{{to_name}}` - Customer's name
- `{{to_email}}` - Customer's email
- `{{service}}` - Selected service name
- `{{date}}` - Appointment date
- `{{time}}` - Appointment time
- `{{phone}}` - Customer's phone number
- `{{notes}}` - Special requests/notes
- `{{booking_id}}` - Unique booking reference
- `{{shop_address}}` - Your shop address
- `{{shop_phone}}` - Your shop phone number

## Troubleshooting

**Emails not sending?**
- Verify all EmailJS credentials are correct
- Check browser console for error messages
- Ensure the email service is properly connected in EmailJS dashboard
- Verify your email template is active

**Emails going to spam?**
- Add your sending email to the customer's contacts
- Use a professional email address (not free Gmail/Outlook for business)
- Keep email content professional and concise

## Additional Notes

- The system sends TWO emails:
  1. Confirmation to the customer
  2. Notification to your admin email
  
- All bookings are also saved to localStorage as a backup
- If email fails, the booking is still saved and you'll see an error message
