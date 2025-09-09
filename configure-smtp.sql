-- Configure SMTP settings for MailHog (local development)
UPDATE notification_settings SET setting_value = 'localhost' WHERE setting_key = 'smtp_host';
UPDATE notification_settings SET setting_value = '1025' WHERE setting_key = 'smtp_port';
UPDATE notification_settings SET setting_value = '' WHERE setting_key = 'smtp_username';
UPDATE notification_settings SET setting_value = '' WHERE setting_key = 'smtp_password';
UPDATE notification_settings SET setting_value = 'false' WHERE setting_key = 'smtp_secure';
UPDATE notification_settings SET setting_value = 'noreply@dozyr.com' WHERE setting_key = 'from_email';
UPDATE notification_settings SET setting_value = 'Dozyr' WHERE setting_key = 'from_name';

-- Display current settings
SELECT * FROM notification_settings WHERE setting_key LIKE 'smtp_%' OR setting_key IN ('from_email', 'from_name');