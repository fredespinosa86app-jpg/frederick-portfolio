# T2 checklist: icon buttons on the other dashboard pages (live test)

What changed: the row actions on the owner dashboard are now icon buttons, like the Training page you already approved (T1): arrow up and down to move, pencil to edit or rename, trash to delete (red), plus copy, clock (history), archive and restore on Client IDs, and an eye to open a document. The 13 **Add ...** buttons keep their text and gain a plus icon. Hover shows the action name; screen readers still hear "Edit: Name", "Delete: Name".

Stays as text on purpose: buttons whose label depends on the state (Mark ready, Submit, Replace, Confirm remove, Reviewed, Addressed, Archive on the question history, Preview / Hide preview in the chatbot knowledge base, Save, Cancel, dialog buttons) and the Delete button inside the library picture dialog.

No rules change, no Worker change, no security-rule change. Upload the changed files, wait for GitHub Pages, hard-refresh (Ctrl+Shift+R), sign in.

For each page: (a) the row buttons are icons, (b) the first row's up arrow and the last row's down arrow are greyed out, (c) up and down move the row, (d) the pencil opens the editor (Cancel closes it), (e) the trash asks first with the item's name (press Cancel; delete one test item only if you want to).

1. Services. Pass: yes / no
2. Toolkit: both the category rows and the tool rows. Pass: yes / no
3. Testimonials. Pass: yes / no
4. Chatbot knowledge base (also: Preview still works as a text button). Pass: yes / no
5. How I Work videos. Pass: yes / no
6. FAQ. Pass: yes / no
7. Experience. Pass: yes / no
8. Clients: pencil and trash; also the blocked-periods list on the Availability page (trash). Pass: yes / no
9. Service forms: the service options, the forms, and the questions inside a form (open **Edit** a form). Pass: yes / no
10. Client IDs: copy (puts the ID on the clipboard), pencil (note), clock (history), archive (asks for a reason) / restore. Pass: yes / no
11. Documents: eye (open), pencil (edit), trash (asks first). Pass: yes / no
12. Library: the pencil on a picture opens its editor. Pass: yes / no
13. Billing profiles (pencil, clock) and the Inbox > Question history trash. Pass: yes / no
14. The **Add** buttons (for example Add service, Add video, Add client) show a plus and their text. Pass: yes / no
15. On your phone (or a narrow browser window): the buttons are easy to tap and a row does not run off the screen. Pass: yes / no / not tried

If a button does nothing or shows an empty square, tell me the page and which button.

Rollback: upload the files from `CodeFlow-Portfolio-4.5.0-T2-rollback.zip`.
