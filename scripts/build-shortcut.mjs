// Generates the ready-made "Bukit Pennies Capture" iOS shortcut as an
// unsigned .shortcut plist. The ingest URL is baked in; the user only pastes
// their bp_ token into the Text action at the top of the shortcut.
//
// iOS refuses to import unsigned shortcut files, so CI signs the output with
// `shortcuts sign --mode anyone` (macOS only) — see
// .github/workflows/ios-shortcut.yml. The signed file is published on the
// GitHub release tagged `shortcut`, which the app links to.
//
// Usage: node scripts/build-shortcut.mjs <ingest-url> [out-file]

import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ingestUrl = process.argv[2];
if (!ingestUrl || !/^https:\/\/.+\/functions\/v1\/ingest$/.test(ingestUrl)) {
  console.error('Usage: node scripts/build-shortcut.mjs https://<ref>.supabase.co/functions/v1/ingest [out-file]');
  process.exit(1);
}
const outFile = process.argv[3] ?? 'Bukit-Pennies-Capture.shortcut';

const TOKEN_PLACEHOLDER = 'PASTE-YOUR-TOKEN-HERE';
const tokenActionUUID = randomUUID().toUpperCase();

// Object-attachment placeholder character used by WFTextTokenString.
const OBJ = '￼';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A WFTextTokenString whose text interpolates variables at given ranges.
function tokenString(string, attachments) {
  const ranges = Object.entries(attachments ?? {})
    .map(
      ([range, att]) => `
              <key>${range}</key>
              <dict>
                ${Object.entries(att)
                  .map(([k, v]) => `<key>${k}</key>\n                <string>${esc(v)}</string>`)
                  .join('\n                ')}
              </dict>`,
    )
    .join('');
  return `
        <dict>
          <key>Value</key>
          <dict>
            <key>string</key>
            <string>${esc(string)}</string>
            <key>attachmentsByRange</key>
            <dict>${ranges}
            </dict>
          </dict>
          <key>WFSerializationType</key>
          <string>WFTextTokenString</string>
        </dict>`;
}

function dictField(items) {
  return `
        <dict>
          <key>Value</key>
          <dict>
            <key>WFDictionaryFieldItems</key>
            <array>
              ${items.join('\n              ')}
            </array>
          </dict>
          <key>WFSerializationType</key>
          <string>WFDictionaryFieldValue</string>
        </dict>`;
}

function dictItem(key, valueTokenString) {
  return `<dict>
                <key>WFItemType</key>
                <integer>0</integer>
                <key>WFKey</key>
                ${tokenString(key)}
                <key>WFValue</key>
                ${valueTokenString}
              </dict>`;
}

const tokenVar = {
  Type: 'ActionOutput',
  OutputUUID: tokenActionUUID,
  OutputName: 'Text',
};
const inputVar = { Type: 'ExtensionInput' };

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowMinimumClientVersion</key>
  <integer>900</integer>
  <key>WFWorkflowMinimumClientVersionString</key>
  <string>900</string>
  <key>WFWorkflowClientVersion</key>
  <string>2607.1.3</string>
  <key>WFWorkflowIcon</key>
  <dict>
    <key>WFWorkflowIconStartColor</key>
    <integer>4271458815</integer>
    <key>WFWorkflowIconGlyphNumber</key>
    <integer>59756</integer>
  </dict>
  <key>WFWorkflowImportQuestions</key>
  <array/>
  <key>WFWorkflowTypes</key>
  <array/>
  <key>WFWorkflowInputContentItemClasses</key>
  <array>
    <string>WFStringContentItem</string>
  </array>
  <key>WFWorkflowActions</key>
  <array>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.comment</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFCommentActionText</key>
        <string>Bukit Pennies setup — one step: replace the text below with your capture token from the app (Settings → Capture devices). Nothing else needs editing.</string>
      </dict>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.gettext</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>UUID</key>
        <string>${tokenActionUUID}</string>
        <key>WFTextActionText</key>
        ${tokenString(TOKEN_PLACEHOLDER)}
      </dict>
    </dict>
    <dict>
      <key>WFWorkflowActionIdentifier</key>
      <string>is.workflow.actions.downloadurl</string>
      <key>WFWorkflowActionParameters</key>
      <dict>
        <key>WFURL</key>
        <string>${esc(ingestUrl)}</string>
        <key>WFHTTPMethod</key>
        <string>POST</string>
        <key>ShowHeaders</key>
        <true/>
        <key>WFHTTPHeaders</key>
        ${dictField([
          dictItem('Authorization', tokenString(`Bearer ${OBJ}`, { '{7, 1}': tokenVar })),
          dictItem('Content-Type', tokenString('application/json')),
        ])}
        <key>WFHTTPBodyType</key>
        <string>JSON</string>
        <key>WFJSONValues</key>
        ${dictField([
          dictItem('text', tokenString(OBJ, { '{0, 1}': inputVar })),
          dictItem('source', tokenString('ios_shortcut')),
        ])}
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;

writeFileSync(outFile, plist);
console.log(`wrote ${outFile} (ingest: ${ingestUrl})`);
