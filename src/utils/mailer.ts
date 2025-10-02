import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // smtp.office365.com
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // Office365 usa STARTTLS, no SSL directo
  auth: {
    user: process.env.SMTP_USER, // soporte2.ti@iste.edu.ec
    pass: process.env.SMTP_PASS, // tu contraseña
  },
  tls: {
    ciphers: "SSLv3",
  },
});

// tipado de adjuntos según Nodemailer
interface MailAttachment {
  filename: string;
  path: string;
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  attachments: { filename: string; path: string }[] = [],
  html?: string
) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    attachments,
    ...(html ? { html } : {}),
  };

  try {
    console.log(`📧 Enviando correo a ${to} con asunto "${subject}"`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Correo enviado a ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    throw error;
  }
}
