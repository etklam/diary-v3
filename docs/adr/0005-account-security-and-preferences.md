# Account security and preferences

Status: accepted

Session issuance, Web refresh, native rotation and account-wide revocation serialize on one transaction-scoped user advisory lock. Native family operations acquire the user lock before the family lock. State is re-read after acquiring locks. This prevents a login or rotation from inserting an old-version active refresh row after account revocation, and prevents queued old-password logins from succeeding after a password change.

Logout-all increments tokenVersion and revokes active refresh rows with LOGOUT_ALL atomically. Password change updates the hash, increments tokenVersion and deletes refresh rows atomically; concurrent changes re-check the current hash under the lock. Cookies clear only after commit. Socket disconnection is integrated in ticket 33, not claimed here.

A wrong current password retains the existing 401 AUTH_LOGIN_INVALID_CREDENTIALS contract. Both shared transports recognize this as an operation error: they do not refresh, retry or clear the session for it. The browser preserves the form and displays the error. Other authentication failures retain normal recovery/revocation behavior.

Settings retain the existing owner-only GET/PUT endpoints and partial updates. Locale and holiday exclusion are now account-persisted instead of being shared implicitly by everyone using a browser. Holiday exclusion defaults to true, matching the frozen settings page. Empty names can be cleared; zero expected trades remains zero. These fix legacy UI fallback and storage behavior under the user's bug-fix authorization.

Preference amounts accept numbers or exact decimal strings, round half away from zero to numeric(15,2), and return strings. Overflow is a validation error before the DB write. Timezones are validated with Intl, stored explicitly, and used to derive civil dates without substituting the device timezone. No old data migration is included; migration 0001 adds the new settings columns to this project's schema.

Evidence: real PostgreSQL/HTTP account-security tests deliberately overlap native rotation with logout-all and password change with old-password login. Settings HTTP tests exercise persistence across login, owner isolation, CSRF, native access, invalid values and exact decimals. Domain tests cover DST/date boundaries and decimal rounding. Browser acceptance is recorded in tickets 06 and 07 separately.
