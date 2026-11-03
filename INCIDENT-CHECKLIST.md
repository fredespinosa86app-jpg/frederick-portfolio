# If you think the site, an account or the data was compromised

Print this or keep a copy outside the project. Work top to bottom; write down the time you did each step.

1. **Stop new data.** Owner panel > Security > "Pause public submissions".
2. **Secure the accounts.** Change the Google password; myaccount.google.com > Security > sign out of all devices; confirm 2-Step Verification is on. Repeat for GitHub (and revoke tokens/SSH keys you do not recognise) and Cloudflare.
3. **Check what happened.** Owner panel > Dashboard > Activity log. Firebase console > Authentication > Users: delete accounts you do not know. Firebase console > Firestore > Usage: look for a sudden jump in reads or writes.
4. **Replace secrets.** Create a new n8n/Make webhook address and secret, update the Cloudflare Worker variables, and delete the old webhook. Never put these in the site files.
5. **Recover.** Owner panel > Privacy & backup > Restore from the latest backup you trust (site settings, content, private settings, clients). Then redo the Security checklist.
6. **Check the code.** Compare the files on GitHub with your last ZIP (GitHub > Commits shows who changed what). Revert anything you did not do.
7. **Tell people if needed.** If clients' or visitors' personal data may have been exposed, the Data Privacy Act (RA 10173) can require telling the National Privacy Commission and the people affected within 72 hours of knowing. See privacy.gov.ph. Record what happened, when you found out, what data, and what you did.
8. **Afterwards.** Download a fresh backup, review the privacy notice, and write one line on what you will change so it cannot repeat.

Free helpers: Firebase console (Authentication, Firestore Usage), Google Security Checkup (myaccount.google.com/security-checkup), GitHub Security log (Settings > Security log).
