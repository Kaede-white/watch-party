# Working Email Template

## Step 1: Edit Your Template in EmailJS

Go to: https://dashboard.emailjs.com/admin/templates

Click on your template `template_qgld02c` to edit it.

## Step 2: Use This Exact Content

### Subject (copy exactly):
```
Booking Confirmed - {{service}} | The Gentleman's Cut
```

### To Email (copy exactly):
```
{{to_email}}
```

### From Name (copy exactly):
```
The Gentleman's Cut
```

### Reply To (copy exactly):
```
kaederivera11@gmail.com
```

### Content (copy all of this):
```html
<h2 style="color: #8b7355;">Hello {{to_name}}!</h2>

<p>Your appointment has been confirmed. Here are your booking details:</p>

<div style="background: #f5f3ef; padding: 20px; border-radius: 10px; margin: 20px 0;">
  <h3 style="margin-top: 0;">📅 Appointment Details</h3>
  <p><strong>Service:</strong> {{service}}</p>
  <p><strong>Date:</strong> {{date}}</p>
  <p><strong>Time:</strong> {{time}}</p>
  <p><strong>Booking ID:</strong> #{{booking_id}}</p>
  <p><strong>Your Phone:</strong> {{phone}}</p>
  {{#if notes}}
  <p><strong>Special Requests:</strong> {{notes}}</p>
  {{/if}}
</div>

<div style="background: #e8e4dc; padding: 15px; border-radius: 8px; margin: 20px 0;">
  <h4>📍 Location</h4>
  <p>123 Barber Street, Suite 100<br>
  Phone: (555) 123-4567</p>
</div>

<p><strong>Important:</strong> Please arrive 5 minutes early. If you need to cancel or reschedule, please call us at least 2 hours in advance.</p>

<hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

<p style="color: #666; font-size: 14px;">
  Thank you for choosing The Gentleman's Cut!<br>
  © 2025 The Gentleman's Cut
</p>
```

## Step 3: Save and Test

1. Click **"Save"** in EmailJS
2. Run your app: `npm run dev`
3. Submit a booking
4. Check Gmail

## Common Issues Fixed

| Issue | Solution |
|-------|----------|
| Variables show as `{{name}}` instead of actual value | Variable name in template doesn't match code - use exact names above |
| Email has no styling | EmailJS requires inline CSS - styles in `<style>` tags don't work in Gmail |
| Missing fields | Make sure to use `{{#if notes}}` for optional fields |

## Template Variables Must Match Exactly

What your code sends:
- `to_name` ← Your name field
- `to_email` ← Your email field  
- `service` ← Selected service
- `date` ← Selected date
- `time` ← Selected time
- `phone` ← Phone number
- `notes` ← Special requests
- `booking_id` ← Auto-generated ID
- `shop_address` ← Shop address
- `shop_phone` ← Shop phone

If still not working, check the browser console (F12) for error messages and share them with me.
