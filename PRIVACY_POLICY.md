# SYBA Privacy Policy

**Last Updated: February 26, 2026**

## Overview

SYBA ("Start Your Bitcoin Adoption") is a Bitcoin-first personal finance app. Your privacy is our top priority — SYBA is designed to keep your financial data on your device.

## Data Collection

**SYBA does not collect, store, or transmit your personal financial data to external servers.**

- **No tracking or analytics** — SYBA does not use any analytics SDKs, tracking pixels, or third-party analytics services.
- **No advertising** — SYBA does not display ads or share data with advertisers.
- **All financial data stays on your device** — Your financial records, settings, and preferences are stored locally on your device using encrypted secure storage (AES-256).

## Authentication

SYBA uses LNURL-auth for optional Lightning-based authentication. This is a privacy-preserving login method that does not require an email address, phone number, or password. Authentication is handled through your Lightning wallet, and no personally identifiable information is collected during this process.

## Subscription

SYBA offers a premium subscription paid via Lightning Network. Payment processing is handled through the Blink API. No credit card information or traditional payment data is collected by SYBA.

## Biometric Authentication

SYBA supports optional biometric authentication (fingerprint/face recognition) for app access. Biometric data is handled entirely by your device's operating system and is never accessed or stored by SYBA.

## Network Requests

SYBA makes the following network requests solely to provide core functionality:

- **Exchange rate data** — Fetches current Bitcoin and fiat currency exchange rates from public APIs (Upbit). No personal data is sent in these requests.
- **Authentication** — LNURL-auth requests to Supabase for login verification.
- **Subscription** — Lightning payment verification through Blink API.

## Data Security

- All locally stored data is encrypted using AES-256 and protected using your device's secure storage mechanisms.
- SYBA does not transmit your financial records over the internet.
- Biometric and PIN-based app lock options are available for additional security.

## Children's Privacy

SYBA is not directed at children under the age of 13. We do not knowingly collect any personal information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be reflected in the "Last Updated" date above.

## Contact

If you have any questions about this Privacy Policy, please open an issue on our GitHub repository:
https://github.com/AsadoConKimchi/syba_start_your_bitcoin_adoption/issues
