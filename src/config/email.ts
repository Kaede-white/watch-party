// Email Configuration using Formspree
// Formspree is a reliable form backend that sends emails to your Gmail
// Get your form endpoint from: https://formspree.io/

export const EMAIL_CONFIG = {
  // Your Formspree form endpoint
  // Get it free at: https://formspree.io/register
  // After creating a form, you'll get a URL like: https://formspree.io/f/xnqkvnzp
  FORMSPREE_ENDPOINT: 'https://formspree.io/f/mreyenpr',

  // Your Gmail address where notifications will be sent
  ADMIN_EMAIL: 'kaederivera11@gmail.com',
}

// Instructions:
// 1. Go to https://formspree.io/ and sign up (free)
// 2. Create a new form
// 3. Copy your form endpoint URL (looks like: https://formspree.io/f/xnqkvnzp)
// 4. Replace 'https://formspree.io/f/YOUR_FORM_ID' above with your actual endpoint
// 5. In Formspree dashboard, add kaederivera11@gmail.com as a recipient
// 6. Save this file and restart the dev server
//
// Features:
// - Free tier: 50 submissions/month
// - Sends emails directly to your Gmail
// - Built-in spam protection
// - Auto-responses available (paid)
