<?php
/**
 * StaffSync — Mail configuration
 * Fill in your Gmail credentials below.
 *
 * Gmail setup:
 *  1. Enable 2-Factor Authentication on your Google account
 *  2. Go to https://myaccount.google.com/apppasswords
 *  3. Create an App Password for "Mail" → copy the 16-char password here
 *  4. Use your full Gmail address as MAIL_USER
 *
 * This file is NOT committed to git (add it to .gitignore).
 */

define('MAIL_SMTP_HOST',   'smtp.gmail.com');
define('MAIL_SMTP_PORT',   587);
define('MAIL_SMTP_SECURE', 'tls');          // 'tls' for port 587, 'ssl' for port 465

define('MAIL_USER',     'ykdann54@gmail.com');
define('MAIL_PASS',     'obov kdvz cjcv ildy');  // Gmail app password — no spaces
define('MAIL_FROM_NAME',   'StaffSync — DevX Ltd');
define('MAIL_FROM_ADDR',     'ykdann54@gmail.com');
