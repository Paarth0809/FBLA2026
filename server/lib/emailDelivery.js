function redact(value = '') {
  if (!value) return 'UNSET';
  if (value.length <= 4) return 'SET';
  return `${value.slice(0, 2)}…${value.slice(-2)}`;
}

function quoteDisplayName(name = '') {
  return String(name || '')
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildAddress(name, email) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) return '';
  const cleanName = quoteDisplayName(name || 'Green Level Lost & Found');
  return `"${cleanName}" <${cleanEmail}>`;
}

function resolveResendFrom(env) {
  if (env.EMAIL_FROM) return env.EMAIL_FROM.trim();
  return buildAddress(
    env.RESEND_FROM_NAME || env.EMAIL_FROM_NAME || 'Green Level Lost & Found',
    env.RESEND_FROM_EMAIL || env.EMAIL_FROM_EMAIL
  );
}

function resolveSmtpFrom(env) {
  if (env.EMAIL_FROM) return env.EMAIL_FROM.trim();
  return buildAddress(
    env.SMTP_FROM_NAME || env.EMAIL_FROM_NAME || 'Green Level Lost & Found',
    env.SMTP_FROM_EMAIL || env.EMAIL_FROM_EMAIL || env.SMTP_USER
  );
}

function hasSmtpConfig(env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function resolveEmailConfig(env = process.env) {
  const preferred = String(env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  const resendFrom = resolveResendFrom(env);
  const smtpFrom = resolveSmtpFrom(env);

  if (preferred === 'preview' || preferred === 'local-preview' || preferred === 'none') {
    return {
      mode: 'local-preview',
      reason: `EMAIL_PROVIDER=${preferred}`
    };
  }

  if (preferred === 'resend') {
    if (!env.RESEND_API_KEY) {
      return { mode: 'local-preview', reason: 'missing RESEND_API_KEY' };
    }
    if (!resendFrom) {
      return { mode: 'local-preview', reason: 'missing RESEND_FROM_EMAIL or EMAIL_FROM' };
    }
    return {
      mode: 'resend',
      apiKey: env.RESEND_API_KEY,
      from: resendFrom
    };
  }

  if (preferred === 'smtp') {
    if (!hasSmtpConfig(env)) {
      return { mode: 'local-preview', reason: 'missing SMTP_HOST, SMTP_USER, or SMTP_PASS' };
    }
    return {
      mode: 'smtp',
      from: smtpFrom,
      smtp: {
        host: env.SMTP_HOST,
        port: parseInt(env.SMTP_PORT || '587', 10),
        secure: env.SMTP_SECURE === 'true',
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        },
        tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
        connectionTimeout: parseInt(env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
        greetingTimeout: parseInt(env.SMTP_GREETING_TIMEOUT_MS || '10000', 10),
        socketTimeout: parseInt(env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10)
      }
    };
  }

  if (env.RESEND_API_KEY && resendFrom) {
    return {
      mode: 'resend',
      apiKey: env.RESEND_API_KEY,
      from: resendFrom
    };
  }

  if (hasSmtpConfig(env)) {
    return {
      mode: 'smtp',
      from: smtpFrom,
      smtp: {
        host: env.SMTP_HOST,
        port: parseInt(env.SMTP_PORT || '587', 10),
        secure: env.SMTP_SECURE === 'true',
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        },
        tlsRejectUnauthorized: env.SMTP_TLS_REJECT_UNAUTHORIZED,
        connectionTimeout: parseInt(env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10),
        greetingTimeout: parseInt(env.SMTP_GREETING_TIMEOUT_MS || '10000', 10),
        socketTimeout: parseInt(env.SMTP_SOCKET_TIMEOUT_MS || '15000', 10)
      }
    };
  }

  return {
    mode: 'local-preview',
    reason: 'no email provider configured'
  };
}

function createPreviewDelivery(config) {
  return {
    mode: 'local-preview',
    config,
    async verify() {
      return { verified: false, mode: 'local-preview', reason: config.reason };
    },
    async send() {
      return { sent: false, mode: 'local-preview', reason: config.reason };
    }
  };
}

function normalizeResendError(error) {
  if (!error) return 'Unknown Resend error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown Resend error';
  }
}

function createResendDelivery(config, options = {}) {
  const ResendCtor = options.ResendCtor || require('resend').Resend;
  const client = new ResendCtor(config.apiKey);

  return {
    mode: 'resend',
    config,
    async verify() {
      return { verified: true, mode: 'resend' };
    },
    async send({ to, subject, text }) {
      const result = await client.emails.send({
        from: config.from,
        to,
        subject,
        text
      });

      if (result && result.error) {
        throw new Error(normalizeResendError(result.error));
      }

      return {
        sent: true,
        mode: 'resend',
        providerId: result?.data?.id || result?.id || null
      };
    }
  };
}

function createSmtpDelivery(config, options = {}) {
  const nodemailer = options.nodemailer || require('nodemailer');
  const smtpOptions = { ...config.smtp };
  const tlsRejectUnauthorized = smtpOptions.tlsRejectUnauthorized;
  delete smtpOptions.tlsRejectUnauthorized;
  if (tlsRejectUnauthorized === 'false') {
    smtpOptions.tls = { rejectUnauthorized: false };
  }
  const transporter = nodemailer.createTransport(smtpOptions);

  return {
    mode: 'smtp',
    config,
    async verify() {
      await transporter.verify();
      return { verified: true, mode: 'smtp' };
    },
    async send({ to, subject, text }) {
      const result = await transporter.sendMail({
        from: config.from,
        to,
        subject,
        text
      });
      return {
        sent: true,
        mode: 'smtp',
        providerId: result?.messageId || null
      };
    }
  };
}

function createEmailDelivery(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;

  if (env.NODE_ENV === 'test' && env.EMAIL_DELIVERY_TEST_ALLOW_REAL !== 'true') {
    return createPreviewDelivery({ mode: 'local-preview', reason: 'test environment' });
  }

  const config = resolveEmailConfig(env);

  try {
    if (config.mode === 'resend') {
      const delivery = createResendDelivery(config, options);
      logger.log?.('[EmailDelivery] Resend email provider initialized.');
      return delivery;
    }

    if (config.mode === 'smtp') {
      const delivery = createSmtpDelivery(config, options);
      logger.log?.('[EmailDelivery] SMTP email provider initialized.');
      return delivery;
    }
  } catch (err) {
    logger.error?.('[EmailDelivery] Failed to initialize email provider:', err.message);
    return createPreviewDelivery({
      mode: 'local-preview',
      reason: `provider initialization failed: ${err.message}`
    });
  }

  return createPreviewDelivery(config);
}

module.exports = {
  buildAddress,
  createEmailDelivery,
  redact,
  resolveEmailConfig
};
