# W5c checklist: break alarm (live test)

No rules change and no Worker change. Install the files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in. Use headphones or low volume for the first test.

## A. Install
Upload the changed files from the ZIP. Do NOT republish the Firestore rules (unchanged).

## B. Live checks
1. Owner Panel > WorkTrack: a card **Alarm (this device)** says it is a browser reminder and the alarm is off. Pass: yes / no
2. For a quick test set the Default schedule **Lunch to 2** minutes (Break schedules card). Pass: yes / no
3. Tick **Alarm on**. Choose Warn **1 minute**, Repeat **every 1 minute**, Sound **Chime**, Volume 60%. Press **Test sound**: you hear the chime. Try the other three sounds and the volume. Pass: yes / no
4. Clock in, press **Lunch out**. About 1 minute later you hear one **soft tone** and the clock text turns amber. Pass: yes / no
5. At 2 minutes: the **chime** plays, the browser tab title alternates with "Late: lunch", and the Lunch in button pulses. Pass: yes / no
6. It repeats once a minute. Press **Silence alarm** on the clock (or on the card): the sound and title flashing stop; the late text and pulse stay. Pass: yes / no
7. Press **Lunch in**: everything stops at once and the tab title is back to normal. Pass: yes / no
8. Next break rings again: First break out with the First break limit at 1 or 2 minutes (Break schedules card) and let it ring. Press First break in. Pass: yes / no
9. Switch to another browser tab during a break and wait for the deadline: the sound still plays (it may be later or silent on some phones: note what you see). Pass: yes / no / notes
10. **Notifications**: press "Allow notifications", allow in the browser. Next break, the pop-up says only "Your lunch ends soon." and "Time to come back from lunch." (no client, no time). Pass: yes / no
11. Reload the page while a break is already late: **no sound** plays (the pulse and text still show). Pass: yes / no
12. Sign out during a break: the sound and title flashing stop. Sign in again: nothing sounds for the old break. Pass: yes / no
13. Close the browser entirely during a break and wait past the deadline: nothing can sound (this is expected: browser reminder only). Pass: understood
14. Clock buttons: **Corner** moves the clock to the next corner (bottom right, bottom left, top left, top right). **Reset clock position** (Alarm card) puts it back top right. Pass: yes / no
15. Before the first click after loading the page, with the alarm on, the clock shows **Tap to enable alarm sound**; clicking it removes the chip. Pass: yes / no
16. Put the Default Lunch back to 60 and switch the alarm off if you do not want it. Pass: yes / no

## C. If something is wrong
Rollback ZIP restores the previous files. The alarm stores nothing in the database, so nothing needs repairing. Tell me the failed step and what you heard or saw (and the browser and device).
