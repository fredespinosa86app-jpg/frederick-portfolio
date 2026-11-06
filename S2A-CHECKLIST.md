# S2-A checklist: turn on 2-step verification (Cloudflare, GitHub, Google)

Nothing to upload. Do this yourself; never paste codes, recovery codes or passwords into the chat or the repository. Tell me only "done" or what went wrong.

## A. Cloudflare
1. Confirm your Cloudflare account email is **verified** (a link in a Cloudflare email). If you signed up with a social login, first set a password using "Forgot password". Otherwise you can lock yourself out. Done: yes / no
2. Cloudflare dashboard > top right **My Profile** > **Authentication**. Done: yes / no
3. Next to **Mobile App Authentication** press **Add**, enter your password, scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy), type the 6-digit code. Done: yes / no
4. Add a **second factor**: **Security Key Authentication** (Touch ID, Windows Hello or a YubiKey) or **Email Authentication** > Enable. Two different factors protect you if you lose a phone. Done: yes / no
5. **Recovery codes**: save the backup codes in your password manager (each works once). Regenerating them cancels the old ones (Profile > Authentication > Two-Factor Authentication > Manage > Regenerate). Done: yes / no
6. Test: sign out of Cloudflare, sign in again; it asks for the code. Done: yes / no

## B. GitHub (it controls the site files)
7. GitHub > Settings > **Password and authentication** > Two-factor authentication is on, with recovery codes saved. Done: yes / no / already on

## C. Google account (it controls Firebase and your owner sign-in)
8. myaccount.google.com > **Security** > **2-Step Verification** is on, with a backup option. Done: yes / no / already on

## D. Pre-check for the rate-limit step (S2-B), 5 minutes, no changes
9. Cloudflare > Workers & Pages > `portfolio-forms` > Settings > **Bindings** > Add: is there a **Rate limiting** choice? Answer: yes / no / not sure (a screenshot without secrets helps).
10. How do you deploy the Worker today: pasting code in the dashboard "Edit code" editor (as before), or connected to GitHub? Answer: ____
11. Do you own a custom domain that could sit on Cloudflare? Answer: yes / no / later

Why: with 2-step verification on, a stolen password alone can no longer change your Worker, its secrets or your site.
