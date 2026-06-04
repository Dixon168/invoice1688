import emailjs from '@emailjs/browser'

// ---- Fill these 3 values from your EmailJS dashboard ----
// publicKey : Account → General → API Keys → "Public Key"
// serviceId : Email Services → your service → "Service ID"
// templateId: Email Templates → your template → "Template ID"
// (These are safe to keep in front-end code; EmailJS is designed for client-side use.)
export const EMAILJS = {
  publicKey: 'NMKFVvA_8ljHYQZHK',
  serviceId: 'service_b8lul4l',
  templateId: 'template_b9bqzgi',
}

export const configured = () =>
  Boolean(EMAILJS.publicKey && EMAILJS.serviceId && EMAILJS.templateId)

// Sends the signup details to your support inbox. Fails quietly if not yet configured.
export async function sendSignupEmail(form, plan) {
  if (!configured()) return
  const message = [
    `Plan: ${plan}`,
    `Company: ${form.company_name}`,
    `Contact: ${form.contact_name}`,
    `Email: ${form.email}`,
    `Phone: ${form.phone}`,
    `Billing: ${[form.billing_address, form.city, form.state, form.postal_code, form.country].filter(Boolean).join(', ')}`,
    form.notes ? `Notes: ${form.notes}` : '',
  ].filter(Boolean).join('\n')

  return emailjs.send(
    EMAILJS.serviceId,
    EMAILJS.templateId,
    {
      to_email: 'support@allinonepayment.com',
      reply_to: form.email,
      plan,
      company_name: form.company_name,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      billing_address: form.billing_address,
      city: form.city,
      state: form.state,
      postal_code: form.postal_code,
      country: form.country,
      notes: form.notes,
      message,
    },
    { publicKey: EMAILJS.publicKey },
  )
}
