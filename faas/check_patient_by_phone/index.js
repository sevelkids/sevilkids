// index.js
// DigitalOcean Function: check_patient_by_phone

const DEFAULT_BACKEND_URL = 'http://localhost:3000';

function normalizePhone(phone) {
  if (phone === undefined || phone === null) return '';
  return String(phone).replace(/[^\d+]/g, '').trim();
}

function buildResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: payload,
  };
}

exports.main = async function main(args) {
  try {
    const backendUrl = (args.backend_url || process.env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
    const rawPhone = args.phone_number ?? args.phone ?? '';
    const phone = normalizePhone(rawPhone);

    if (!phone) {
      return buildResponse(400, {
        ok: false,
        action: 'check_patient_by_phone',
        error: 'phone_number is required',
      });
    }

    const url = `${backendUrl}/api/dentist/patients/find-by-phone?phone=${encodeURIComponent(phone)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
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
        action: 'check_patient_by_phone',
        error: 'backend_request_failed',
        backend_status: response.status,
        backend_response: data,
      });
    }

    // Если backend вернул null / пусто / false — считаем, что пациента нет
    if (!data) {
      return buildResponse(200, {
        ok: true,
        action: 'check_patient_by_phone',
        found: false,
        message: 'Клиент не в базе',
      });
    }

    // Пытаемся достать имя и id максимально мягко
    const patientId =
      data.id ??
      data.patientId ??
      data.data?.id ??
      data.data?.patientId ??
      null;

    const patientName =
      data.fullName ??
      data.name ??
      [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' ').trim() ||
      data.data?.fullName ??
      data.data?.name ??
      null;

    return buildResponse(200, {
      ok: true,
      action: 'check_patient_by_phone',
      found: true,
      patient_id: patientId,
      patient_name: patientName || 'Пациент найден',
      raw: data,
    });
  } catch (error) {
    return buildResponse(500, {
      ok: false,
      action: 'check_patient_by_phone',
      error: error.message || 'internal_error',
    });
  }
};