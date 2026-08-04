# Security Policy

Bukit Pennies handles users' bank notification text, which contains card
details. Security is taken seriously here, and the safety invariant matters
more than any single feature: the app never connects to a bank account, bank
credentials, or an open-banking API.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Instead, use
GitHub's private vulnerability reporting:

**[Report a vulnerability](https://github.com/jaredoka/bukit-pennies/security/advisories/new)**

This keeps the report private until a fix is ready, and prevents the details
from reaching anyone who might exploit them.

### What to include

- The affected component: parsers, edge functions, database / RLS, auth, or app
- A description of the issue and its impact
- Steps to reproduce, if possible without sharing real card data
- Any suggested fix

### What to expect

- Reports are acknowledged as soon as possible, typically within a few days.
- You will receive updates as the issue is triaged and fixed.
- After a fix ships, you will be credited for the report if you would like to
  be.

## Scope

This policy covers the code in this repository. Note that:

- The parsers process notification *text* only. They never store or transmit
  credentials.
- The `transactions` write surface is RPC-only, and RLS gates every row.
  Reports about a way around those gates are exactly what this policy exists
  for.
