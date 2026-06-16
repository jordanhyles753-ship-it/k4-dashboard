// K4 SOAP proxy
// Auth flow:
//   1. GET /K4ServerABEKA/ → JBoss creates session, returns JSESSIONID + redirect to login page
//   2. GET login page URL → returns HTML with <form action="...">
//   3. POST credentials to form action WITH JSESSIONID
//   4. SOAP call to PublicationBasic WITH JSESSIONID
//
// ?debug=1 → returns raw diagnostic info from steps 1+2 instead of SOAP data

const K4_ORIGIN = 'https://accelerated-abeka-v16-k4.fluxcloud.us';
const K4_BASE   = `${K4_ORIGIN}/K4ServerABEKA`;
const K4_USER   = 'jordan jones';
const K4_PASS   = 'Minnesota58!';

function extractCookies(headers) {
  const raw = headers.get('set-cookie') || '';
  return raw
    .split(/,(?=\s*\w+=)/g)
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

// Step 1: GET K4 root to establish a JBoss session → returns {cookies, loginUrl}
async function getSession() {
  const r = await fetch(`${K4_BASE}/`, {
    redirect: 'manual',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  const cookies  = extractCookies(r.headers);
  const location = r.headers.get('location') || '';
  console.log('getSession status:', r.status, 'location:', location, 'cookies:', cookies.slice(0, 120));
  return { cookies, location, status: r.status };
}

// Step 2: Follow the redirect to get login page, capture form action
async function getLoginFormAction(location, cookies) {
  const url = location.startsWith('http') ? location : `${K4_ORIGIN}${location}`;
  const r = await fetch(url, {
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      ...(cookies ? { Cookie: cookies } : {}),
    },
  });
  const newCookies = extractCookies(r.headers) || cookies;
  const html = await r.text();
  // Extract form action
  const actionMatch = html.match(/action="([^"]+)"/i);
  const action = actionMatch ? actionMatch[1] : null;
  console.log('loginPage status:', r.status, 'action:', action, 'html prefix:', html.slice(0, 200));
  return { action, cookies: newCookies, html };
}

// Step 3: POST login credentials to the form action URL
async function postLogin(action, cookies) {
  const url = action.startsWith('http') ? action : `${K4_ORIGIN}${action}`;
  const body = new URLSearchParams({
    j_username: K4_USER,
    j_password: K4_PASS,
  });
  const r = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'text/html,application/xhtml+xml',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: body.toString(),
  });
  const newCookies = extractCookies(r.headers) || cookies;
  const location   = r.headers.get('location') || '';
  console.log('postLogin status:', r.status, 'location:', location, 'cookies:', newCookies.slice(0, 120));
  return { cookies: newCookies, location };
}

const issueSoap = pubID => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pt="http://www.vjoon.com/ps/core/publication/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <pt:getIssuesByPublicationID1Request>
      <pt:publicationID>${pubID}</pt:publicationID>
    </pt:getIssuesByPublicationID1Request>
  </soapenv:Body>
</soapenv:Envelope>`;

module.exports = async function handler(req, res) {
  const { pubID, debug } = req.query;

  // Diagnostic mode: show what K4 returns for the init steps
  if (debug === '1') {
    try {
      const r1 = await fetch(`${K4_BASE}/admin/`, {
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      const c1  = extractCookies(r1.headers);
      const loc = r1.headers.get('location') || '';
      const hdrs = {};
      r1.headers.forEach((v,k) => { hdrs[k] = v; });
      const body = await r1.text();
      // Now test: beginLogIn with Origin+Referer spoofed to K4 domain
      const beginBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wt="http://www.vjoon.com/ps/core/user/wstypes/">
  <soapenv:Header/>
  <soapenv:Body>
    <wt:beginLogInAllPublications1Request>
      <wt:domain></wt:domain>
      <wt:userName>${K4_USER}</wt:userName>
      <wt:password>${K4_PASS}</wt:password>
    </wt:beginLogInAllPublications1Request>
  </soapenv:Body>
</soapenv:Envelope>`;
      const commonHeaders = (cookies) => ({
        'Content-Type': 'text/xml;charset=UTF-8',
        'Origin': K4_ORIGIN,
        'Referer': `${K4_BASE}/admin/`,
        ...(cookies ? { Cookie: cookies } : {}),
      });

      // Call 1: no cookies → get fresh JSESSIONID
      const r2 = await fetch(`${K4_BASE}/services/UserBasic`, {
        method: 'POST',
        headers: { ...commonHeaders(''), 'SOAPAction': 'http://www.vjoon.com/k4/user/basic/beginLogInAllPublications1' },
        body: beginBody,
      });
      const jsessionid = extractCookies(r2.headers);
      const body2 = await r2.text();

      // Call 2: retry with the JSESSIONID K4 just created
      const r3 = await fetch(`${K4_BASE}/services/UserBasic`, {
        method: 'POST',
        headers: { ...commonHeaders(jsessionid), 'SOAPAction': 'http://www.vjoon.com/k4/user/basic/beginLogInAllPublications1' },
        body: beginBody,
      });
      const body3 = await r3.text();
      const cookies3 = extractCookies(r3.headers) || jsessionid;

      return res.status(200).json({
        call1: { status: r2.status, cookies: jsessionid, fault: body2.includes('Fault'), ucidMatch: body2.match(/useCaseInstanceID[^>]*>(-?\d+)/)?.[1] },
        call2: { status: r3.status, cookies: cookies3, fault: body3.includes('Fault'), ucidMatch: body3.match(/useCaseInstanceID[^>]*>(-?\d+)/)?.[1] },
        call2body: body3.slice(0, 400),
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (!pubID) return res.status(400).json({ error: 'Missing pubID query param' });

  try {
    // Step 1: establish JBoss session
    const { cookies: c1, location } = await getSession();

    let sessionCookies = c1;

    if (location) {
      // Step 2: get login page to find form action
      const { action, cookies: c2, html } = await getLoginFormAction(location, c1);

      if (action) {
        // Step 3: post credentials
        const { cookies: c3 } = await postLogin(action, c2);
        sessionCookies = c3 || c2;
      } else {
        console.log('No form action found, proceeding with session cookie only');
        sessionCookies = c2;
      }
    }

    console.log('Final session cookies:', sessionCookies.slice(0, 120));

    // Step 4: SOAP call
    const r = await fetch(`${K4_BASE}/services/PublicationBasic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': 'http://www.vjoon.com/k4/publication/basic/getIssuesByPublicationID1',
        ...(sessionCookies ? { Cookie: sessionCookies } : {}),
      },
      body: issueSoap(pubID),
    });

    const xml = await r.text();
    console.log('SOAP status:', r.status, 'fault?', xml.includes('Fault'), 'prefix:', xml.slice(0, 120));

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  } catch (e) {
    console.error('K4 proxy error:', e.message);
    res.status(502).json({ error: `K4 proxy error: ${e.message}` });
  }
};
