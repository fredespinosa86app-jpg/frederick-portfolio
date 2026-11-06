# T1 checklist: Training categories add / copy / delete + icons (live test)

No rules change and no Worker change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R). Do NOT republish the Firestore rules. Take a backup first (Privacy & backup).

## A. Icons
1. Owner Panel > Training categories: each row shows arrows (up, down), a copy icon, a pencil (edit) and a red trash icon. Hover shows a tooltip. Pass: yes / no
2. Tab through the buttons with the keyboard: a visible focus ring; Enter on the trash opens the delete confirmation. Pass: yes / no
3. On your phone the buttons are easy to tap. Pass: yes / no / not tried

## B. Delete
4. Delete one category: the confirmation lists tools and images, and says linked videos/FAQs are not deleted. Cancel keeps it. Pass: yes / no
5. Confirm delete, then press **Discard changes**: it comes back. Delete again and **Publish**: the public site no longer shows it. Pass: yes / no
6. Your videos and FAQs are still there (How I Work and FAQ). Pass: yes / no

## C. Add and copy
7. **Add category** opens an empty editor ("New category"). Give it a title and some text, go back: it says "Hidden from the site". Publish: not on the site yet. Switch it on and publish: it appears. Pass: yes / no
8. At 7 categories Add and Copy are greyed out and the page says "Delete one to add another". Pass: yes / no
9. **Copy** a category (with a free slot): "Copy of ..." appears right below it, hidden. Pass: yes / no
10. Size meter: shows KB of 900 KB. If you ever fill it with images, Copy offers **Copy without images**. Pass: yes / no / not tried

## D. Zero categories and restore
11. Delete every category and publish: the Training section and its menu link disappear from the site. Pass: yes / no
12. **Restore original categories**, publish: they return (only the originals that were switched on are visible). Pass: yes / no

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-T1-rollback.zip`.
