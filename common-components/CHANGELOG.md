# Changelog

All changes to this project will be documented in this file.

## Template [MajorVersion.MediterraneanVersion.MinorVersion] - DD-MM-YYYY

## [0.0.65] 22.07.2026

- Fixed multi-select FormCombobox checkbox selection and aligned its cursor with the option row

## [0.0.64] - 17.07.2026

- Fixed Long Url's column ui
- Updated sanitize-html package to latest version
- Added yes/no filter to Comment and Feedback columns in the chat history table

## [0.0.63] - 06.07.2026

- Modified toast position and appearance

## [0.0.62] - 29.06.2026

- Fixed chosen columns selection persistence
- Fixed updating chat table after changing chat analysis values

## [0.0.61] - 11.06.2026

- Removed redundant scroll from the History table
- Added Apply action to the History table header multi-option filter
- Made the History table header sticky

## [0.0.60] - 09.06.2026

- History table: theme, follow up, quality sorting
- History table: header filter positioning

## [0.0.59] - 05.06.2026

- Quality measurements in chat history view
- Column sorting and filtering
- Analytics: theme, follow up action, response quality

## [0.0.58] - 25.05.2026

- Properly render mcq selected button

## [0.0.57] - 14.05.2026

- Added authenticated person to chosen columns list

## [0.0.56] - 13.05.2026

- Fixed file downloads to run inside an iframe to avoid parent app navigation and beforeunload logout handling for cross-origin signed URLs.

## [0.0.55] - 12.05.2026

- Fixed chat history download response typing

## [0.0.54] - 07.05.2026

- Remove authenticated person fields for filtering

## [0.0.53] - 06.05.2026

- Removed the Chosen CSA filter from chat history.
- Added Clear filters action for chat history filters.
- Added Choose all / Vali kõik option to the chosen columns filter.
- Persisted selected chat history columns in user preferences.

## [0.0.52] - 05.05.2026

- Updated loading logic

## [0.0.51] - 05.05.2026

- History page header alignment

## [0.0.50] - 04.05.2026

- Added authenticated person column

## [0.0.49] - 29.04.2026

- Fixed chat history XLSX download to use the S3 signed URL returned by the API instead of the previous base64 payload.

## [0.0.48] - 23.04.2026

- Added chats preserve feature

## [0.0.47] - 21.04.2026

- Added total chat counter under chat history

## [0.0.46] - 10.04.2026

- Fixed CHAT_STATUS import

## [0.0.45] - 07.04.2026

- Enhanced downloadChatHistory

## [0.0.44] - 26.02.2026

- Removed _ from chosen CSA's list

## [0.0.43] - 06.02.2026

- Prevent url fetch in markdownify for non image urls
- Added Comment Settings to get-chat-by-id
- Enhance eventGroup Function
- Reset Pagination on search change

## [0.0.42] - 04.02.2026

- Fix comment display in chat content view

## [0.0.41] - 04.02.2026

- Added leading space and encoded characters handling in markdownify

## [0.0.40] - 30.01.2026

- Show Message with event and content as an event message with content text

## [0.0.39] - 26.01.2026

- Changed initial end date to be the same as the start date
- Changed empty advisor name to default to 'Bürokratt' instead of '-'
- Fixed CSA messages display

## [0.0.38] - 20.01.2026

- Added isFiveRatingScale Handle

## [0.0.37] - 19.01.2026

- Added Sanitization to Markdownify

## [0.0.36] - 14.01.2026

- Hide $backoffice, $validate_ and $general_knowledge from end user

## [0.0.35] - 09.01.2026

- Fixed Pagination on date change
- Fix Profile Picture and namu UI conflict

## [0.0.34] - 30.12.2025

- Fix building dependents

## [0.0.33] - 22.12.2025

- Updated domain logic change
- Added abort ref to cancel unnecessary api calls.

## [0.0.32] - 19-11-2025

- Fixed isTest Mark.
- Fixed Columns Spacing in Firefox

## [0.0.31] - 18-11-2025

- Added chat id to URL params in chats history page.

## [0.0.30] - 10-11-2025

- Enhanced Markdownify

## [0.0.29] - 03-11-2025

- Added Language to chats/ended/download

## [0.0.28] - 03-10-2025

- Defined new endpoint specifically for ended chats. REACT_APP_RUUTER_PRIVATE_ENDED_API_URL

## [0.0.27] - 02-10-2025

- Adding missing showTest with default to true if undefined.

## [0.0.26] - 15-09-2025

- Added download button do download chat history with currently selected criteriasa
- Added new optional param to enable this button(disabled by default)

## [0.0.25] - 01-09-2025

- Added test column to display chats mark for test
- FIX: refetch based on updated domains

## [0.0.24] - 14-08-2025

- Modified Start and End dates to send them in payload in iso format

## [0.0.23] - 21-07-2025

- Initial support of multidomains
- Added updated key to force fetching on domain change
- Updated store params
- Made store export state for reusability

## [0.0.22] - 01-07-2025

- Handled Previous Messages Edge Case in Buttons

## [0.0.21] - 30-06-2025

- Fix Message With Buttons View.

## [0.0.20] - 21-05-2025

- Making chat view go take all vertical space.

## [0.0.19] - 19-05-2025

- Reduced extra calling of mutation on init.

## [0.0.18] - 16-05-2025

- Made title configurable.
- Made passed dates configurable dynamically.
- Made searchbar configrable
- Updated default column data to handle both null and undefined.

## [0.0.17] - 13-05-2025

- Updated csa display and filtering.


## [0.0.16] - 09-05-2025

- Display feedback rating consistently in history page.

## [0.0.15] - 05-05-2025

- Updated popup duration to be 5 seconds.

## [0.0.14] - 30-04-2025

- Added sorting configurable (disabled by default)
- Added Email display configurable (disabled by default)

## [0.0.13] - 25-04-2025

- Adding double scrollbar to history page when size is small.

## [0.0.12] - 22-04-2025

- Modified Markdowify Logic to handle the case only the list line ends with : followed by space

## [0.0.11] - 01-04-2025

- Updated preference page loading
- Updated date formating for ended chats to hold only date without time.

## [0.0.10] - 14-04-2025

- Changed dialog visibility

## [0.0.9] - 01-04-2025

- Prevent end-users from spoofing URLs in messages

## [0.0.8] - 21-03-2025

- Fixated markdown-to-jsx to version 7.7.3

## [0.0.7] - 19-03-2025

- Fixed End-user messages not visible in chat history

## [0.0.6] - 11-03-2025

- Enhanced Markdownify List Rendering

## [0.0.5] - 28-02-2025

- Added Hex conversion

## [0.0.4] - 20-02-2025

- Fixed context export

## [0.0.3] - 19-02-2025

- Changed rating & feedback to feedbackRating and feedbackText

## [0.0.2] - 18-02-2025

- Used customerSupportFullName instead of display name.

## [0.0.1] - 07-02-2025

- Initial common gui elements.
