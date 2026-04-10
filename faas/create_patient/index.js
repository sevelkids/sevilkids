// faas/create_patient/index.js

const DEFAULT_API_BASE_URL = 'https://api2.dentist-plus.com/partner';
const DEFAULT_BRANCH_ID = 5061;
const DEFAULT_LASTNAME = 'Пациент';

function buildResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: payload,
  };
}

function normalizePhone(phone) {
  if (!phone) return '';
  let value = String(phone).trim().replace(/[^\d+]/g, '');

  if (value.startsWith('8') && value.length === 11) {
    value = '+7' + value.slice(1);
  } else if (value.startsWith('7') && value.length === 11) {
    value = '+' + value;
  } else if (!value.startsWith('+') && value.length >= 10) {
    value = '+' + value;
  }

  return value;
}

exports.main = async function main(args) {
  try {
    const apiBaseUrl = (process.env.DENTIST_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    const token = args.token || process.env.DENTIST_BEARER_TOKEN;
    const branchId = Number(args.branch_id || process.env.DEFAULT_BRANCH_ID || DEFAULT_BRANCH_ID);

    const fname = String(args.fname || '').trim();
    const lname = String(args.lname || process.env.DEFAULT_PATIENT_LASTNAME || DEFAULT_LASTNAME).trim();
    const mname = String(args.mname || '').trim();
    const phone = normalizePhone(args.phone || args.phone_number);

    if (!token) {
      return buildResponse(400, {
        ok: false,
        action: 'create_patient',
        error: 'token is required',
      });
    }

    if (!branchId || !fname || !lname || !phone) {
      return buildResponse(400, {
        ok: false,
        action: 'create_patient',
        error: 'branch_id, fname, lname, phone are required',
      });
    }

    const payload = {
      branch_id: branchId,
      fname,
      lname,
      phone,
      send_notifications: true,
      send_marketing: false,
    };

    if (mname) payload.mname = mname;
    if (args.gender) payload.gender = args.gender;
    if (args.date_of_birth) payload.date_of_birth = args.date_of_birth;
    if (args.source) payload.source = args.source;
    if (args.email) payload.email = args.email;
    if (args.description) payload.description = args.description;

    const response = await fetch(`${apiBaseUrl}/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return buildResponse(response.status, {
        ok: false,
        action: 'create_patient',
        error: 'dentist_plus_request_failed',
        dentist_status: response.status,
        dentist_response: data,
      });
    }

    const patientId = data?.id ?? null;
    const patientName =
      [data?.lname, data?.fname, data?.mname].filter(Boolean).join(' ').trim() || fname;

    return buildResponse(200, {
      ok: true,
      action: 'create_patient',
      patient_id: patientId,
      patient_name: patientName,
      raw: data,
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      action: 'create_patient',
      error: error.message || 'internal_error',
    });
  }
};