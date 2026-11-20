# AI Turnaround Radar – v0.2 live data setup

This version adds a Netlify Function endpoint for live daily candles for MU and SOXX from Twelve Data. The API key is server-side only.

## Important deployment note
The previous site was uploaded using Netlify Drop (static-only deploy). Netlify Functions are not reliably deployed by drag-and-drop manual deploy. Deploy this folder as a Netlify project using Git integration or Netlify CLI/build workflow.

## Configure secret
In Netlify site settings, add an environment variable:
- `TWELVE_DATA_API_KEY` = your Twelve Data API key

Keep the key private. Never put it in `index.html` or share it in chat.

## Function
Endpoint: `/.netlify/functions/radar`
Returns latest daily data and calculated MA20, MA50, RSI (simple period average), daily % change, and a small 0–5 technical check for MU and SOXX. ETF flows are not included yet.

## Deployment outline
1. Extract this ZIP on your computer.
2. Create a GitHub repository and upload the project folder, or deploy using Netlify CLI.
3. Connect the repository to Netlify; the site root is the project folder.
4. Add `TWELVE_DATA_API_KEY` in Netlify environment variables.
5. Redeploy.
6. Open the site and tap **Hämta live-data**.

The main dashboard still contains demo values for the other tickers until their live feeds are implemented. This build is a test integration for MU and SOXX only.
