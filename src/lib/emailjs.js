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
  // optional: a separate template for password-change alerts. Falls back to templateId.
  passwordTemplateId: '',
}

export const configured = () =>
  Boolean(EMAILJS.publicKey && EMAILJS.serviceId && EMAILJS.templateId)

// Sends the signup details to your support inbox. Fails quietly if not yet configured.
export async function sendSignupEmail(form, plan) {
  if (!configured()) return
  const message = [
    `Plan: ${plan}`,
    `Company: ${form.company_name}`,
    `Company phone: ${form.company_phone}`,
    `Contact: ${form.contact_name}`,
    `Email: ${form.email}`,
    `Contact phone: ${form.phone}`,
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
      company_phone: form.company_phone,
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

// Notifies you when a client changes their own password (the new password is NOT sent, for security).
export async function sendPasswordChangeEmail(company, email) {
  if (!configured()) return
  const when = new Date().toLocaleString()
  const message = [
    'A client changed their own login password.',
    `Company: ${company?.name || ''}`,
    `Login email: ${email || ''}`,
    `When: ${when}`,
    '(The new password is not included for security. If they get locked out, set a new one from Admin.)',
  ].join('\n')
  return emailjs.send(
    EMAILJS.serviceId,
    EMAILJS.passwordTemplateId || EMAILJS.templateId,
    {
      to_email: 'support@allinonepayment.com',
      reply_to: email,
      plan: 'Password changed',
      company_name: `${company?.name || ''} — password changed`,
      contact_name: '', email: email || '', phone: '', company_phone: '',
      billing_address: '', city: '', state: '', postal_code: '', country: '',
      notes: `Password changed at ${when}`,
      message,
    },
    { publicKey: EMAILJS.publicKey },
  )
}
