---
name: owasp-top10
description: Use in web application/API/authentication/authorization/data handling/security review contexts to apply the OWASP Top 10 2025 categories during code review, design, and implementation.
---

# OWASP Top 10 2025

Use this skill when writing, reviewing, or refactoring web applications, APIs, authentication flows, authorization logic, or any code that handles untrusted input, sensitive data, or security-relevant decisions.

## Required Policy

Before treating a task as complete, verify that the change does not weaken security against the OWASP Top 10 2025 categories. Apply the following checks proportionally to the change scope.

1. **Broken Access Control**
   - Enforce authorization on every route, handler, and data action, not just the UI.
   - Deny by default; allowlists beat blocklists.
   - Validate that users can only access their own records (IDOR checks).
   - Avoid exposing administrative functions or debug endpoints without explicit gating.
   - Bad: trust client/front-end controls or allow ID/URL tampering. / Good: enforce server-side deny-by-default authorization and ownership checks.

2. **Security Misconfiguration**
   - Remove default credentials, sample accounts, and unnecessary default features.
   - Keep dependency and framework defaults hardened; disable unused modules, ports, and methods.
   - Return minimal error detail to clients; log the rest server-side.
   - Apply least-privilege settings to cloud resources, databases, and file systems.
   - Bad: leave default credentials, sample apps, directory listing, or verbose errors. / Good: use hardened minimal baseline, secure headers, and automated config verification.

3. **Software Supply Chain Failures**
   - Pin dependencies and verify checksums or signatures where the ecosystem supports it.
   - Review new dependencies before adding them; prefer well-maintained packages.
   - Scan dependencies for known vulnerabilities as part of the verification step.
   - Bad: pull untracked/untrusted/outdated dependencies or artifacts. / Good: use SBOMs, trusted sources, signed packages, and vulnerability monitoring.

4. **Cryptographic Failures**
   - Use current, recommended algorithms and libraries; do not roll your own crypto.
   - Encrypt data in transit with TLS and protect data at rest when required.
   - Avoid hard-coded secrets, weak hashes, or reversible encryption for passwords.
   - Manage keys outside source code, with rotation and least-privilege access.
   - Bad: store sensitive data/passwords with weak or no crypto. / Good: use vetted crypto, managed keys, TLS, and adaptive salted password hashing.

5. **Injection**
   - Parameterize all database queries; never concatenate untrusted input into SQL.
   - Encode output for the correct context (HTML, JavaScript, URL, JSON, command line).
   - Validate and sanitize input against allowlists, not deny lists alone.
   - Treat file paths, commands, and LDAP/XML queries with the same caution as SQL.
   - Bad: concatenate untrusted input into queries or commands. / Good: use parameterized APIs/ORMs, allowlist validation, and context-aware escaping.

6. **Insecure Design**
   - Threat-model the change: identify trust boundaries, attack surfaces, and abuse cases.
   - Apply defense in depth; a single control should not be the only protection.
   - Use safe defaults and fail-closed behavior for security decisions.
   - Bad: ship business flows without abuse controls or failure states. / Good: threat-model critical flows and build business-rule controls into design.

7. **Authentication Failures**
   - Use strong, proven authentication mechanisms; implement MFA where applicable.
   - Protect session identifiers, use short timeouts, and invalidate sessions on logout.
   - Rate-limit and monitor credential-related endpoints.
   - Avoid weak or guessable recovery flows.
   - Bad: allow weak/default credentials, brute force, or reused/fixed sessions. / Good: enforce MFA, rate limits, anti-enumeration, fresh sessions, timeout/logout.

8. **Software or Data Integrity Failures**
   - Verify the integrity of updates, plugins, and serialized data.
   - Avoid trusting client-side validation or hidden fields for security decisions.
   - Use signatures or checksums for critical data and pipeline artifacts.
   - Bad: accept untrusted updates/packages or deserialize untrusted data. / Good: verify signatures/integrity, use trusted repos, and reject untrusted serialized data.

9. **Security Logging and Alerting Failures**
   - Log security-relevant events (auth, access control changes, input validation failures) with sufficient context.
   - Do not log secrets, passwords, tokens, or unredacted personal data.
   - Ensure logs are protected from tampering and are reviewable.
   - Bad: miss failed logins/security events, log secrets, or keep tamperable logs. / Good: log security events with context, protect integrity, and alert on suspicious patterns.

10. **Mishandling of Exceptional Conditions**
    - Catch and handle exceptions without leaking sensitive internals.
    - Ensure error paths release resources and do not bypass security controls.
    - Test failure modes explicitly; panic or stack traces must not reach clients.
    - Bad: leak internals, catch errors loosely, or fail open after partial failure. / Good: handle at failure point, fail closed/rollback, and centralize safe error responses.

## Reporting

In the final response, state:

- which OWASP categories were considered for the change;
- any security controls added or confirmed;
- any risks that could not be fully mitigated within the task scope;
- the next verification step the user should run, such as a dependency scan, access-control test, or security review.

## Sources

1. **Broken Access Control**
   - https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/
   - https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
2. **Security Misconfiguration**
   - https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/
3. **Software Supply Chain Failures**
   - https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/
   - https://cheatsheetseries.owasp.org/cheatsheets/Dependency_Graph_SBOM_Cheat_Sheet.html
4. **Cryptographic Failures**
   - https://owasp.org/Top10/2025/A04_2025-Cryptographic_Failures/
   - https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
5. **Injection**
   - https://owasp.org/Top10/2025/A05_2025-Injection/
   - https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html
6. **Insecure Design**
   - https://owasp.org/Top10/2025/A06_2025-Insecure_Design/
   - https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html
7. **Authentication Failures**
   - https://owasp.org/Top10/2025/A07_2025-Authentication_Failures/
   - https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
8. **Software or Data Integrity Failures**
   - https://owasp.org/Top10/2025/A08_2025-Software_or_Data_Integrity_Failures/
9. **Security Logging and Alerting Failures**
   - https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/
   - https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
10. **Mishandling of Exceptional Conditions**
    - https://owasp.org/Top10/2025/A10_2025-Mishandling_of_Exceptional_Conditions/
    - https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

## Notes

This skill is a code-review aid, not a replacement for a full security assessment. When a change touches authentication, authorization, cryptography, or secret handling, escalate to explicit human review even if all checklist items appear satisfied.
