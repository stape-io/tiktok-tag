const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const decodeUriComponent = require('decodeUriComponent');
const fromBase64 = require('fromBase64');
const generateRandom = require('generateRandom');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getEventData = require('getEventData');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Math = require('Math');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');
const toBase64 = require('toBase64');

/*==============================================================================
==============================================================================*/

const API_VERSION = '1.3';
const PARTNER_AGENT_STRING = 'stape_2_1_3' + (data.enableEventEnhancement ? '_ee' : '');

const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) return;

const ids = getClickAndBrowserId(data, eventData);
const ttclid = ids.ttclid;
const ttp = ids.ttp;
setIDsCookies(data, ttclid, ttp);

const mappedData = mapEvent(data, eventData, ttclid, ttp);
sendRequest(data, mappedData);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function getClickAndBrowserId(data, eventData) {
  const ids = {
    ttclid:
      getCookieValues('ttclid')[0] || (eventData.common_cookie || {}).ttclid || eventData.ttclid,
    ttp:
      getCookieValues('_ttp')[0] ||
      (eventData.common_cookie || {})._ttp ||
      eventData._ttp ||
      eventData.ttp
  };

  const url = getUrl(eventData);
  if (url) {
    const urlParsed = parseUrl(url);
    if (urlParsed && urlParsed.searchParams.ttclid) {
      ids.ttclid = decodeUriComponent(urlParsed.searchParams.ttclid);
    }
  }

  if (!ids.ttp && data.generateTtp) {
    ids.ttp = generateTtp();
  }

  return ids;
}

function setIDsCookies(data, ttclid, ttp) {
  const cookieOptions = {
    domain: getCookieDomain(data),
    path: '/',
    samesite: data.cookieSameSite || 'Lax',
    secure: true,
    httpOnly: false
  };

  if (ttclid) {
    cookieOptions['max-age'] = 2592000; // 30 days
    setCookie('ttclid', ttclid, cookieOptions);
  }

  if (ttp) {
    cookieOptions['max-age'] = 34190000; // 13 months
    setCookie('_ttp', ttp, cookieOptions);
  }
}

function mapEvent(data, eventData, ttclid, ttp) {
  const eventSource = data.eventSource || 'web';
  let mappedData = {
    event: getEventName(data, eventData)
  };

  const autoMapEnabled = data.hasOwnProperty('autoMapCommonEventData')
    ? data.autoMapCommonEventData
    : true; // To avoid a breaking change.

  const eventTime =
    data.eventTime ||
    (autoMapEnabled ? eventData.event_time || Math.round(getTimestampMillis() / 1000) : undefined);
  if (eventTime) mappedData.event_time = makeInteger(eventTime);

  const eventId =
    data.eventId || (autoMapEnabled ? eventData.event_id || eventData.transaction_id : undefined);
  if (eventId) mappedData.event_id = eventId;

  if (eventSource === 'web') {
    addPageData(mappedData, eventData);
  }

  if (eventSource === 'app') {
    addAppData(mappedData, eventData);
  }

  if (eventSource === 'web' || eventSource === 'app') {
    mappedData.limited_data_use = data.limitedDataUse || false;
  }

  if (eventSource === 'crm') {
    addLeadData(mappedData);
  }

  mappedData = addUserData(eventData, mappedData, eventSource, ttclid, ttp);
  mappedData = addPropertiesData(eventData, mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  if (data.enableEventEnhancement) {
    mappedData.user = enhanceEventData(mappedData.user, eventData);
    setGtmEecCookie(mappedData.user);
  }

  const requestData = {
    event_source: eventSource,
    event_source_id: data.pixelId,
    data: [mappedData]
  };
  const testEventCode = eventData.test_event_code || data.testEventCode;
  if (testEventCode) requestData.test_event_code = testEventCode;

  return requestData;
}

function hashData(value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'array') {
    return value.map((val) => {
      return hashData(val);
    });
  }

  if (isHashed(value)) {
    return value;
  }

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex'
  });
}

function hashDataIfNeeded(mappedData) {
  if (mappedData.user) {
    const userDataKeysToHash = [
      'external_id',
      'phone',
      'email',
      'first_name',
      'last_name',
      'zip_code'
    ];
    for (let key in mappedData.user) {
      if (userDataKeysToHash.indexOf(key) !== -1) {
        mappedData.user[key] = hashData(mappedData.user[key]);
      }
    }
  }

  return mappedData;
}

function addPropertiesData(eventData, mappedData) {
  mappedData.properties = {};

  const autoMapEnabled = data.hasOwnProperty('autoMapCustomData') ? data.autoMapCustomData : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    let items;
    if (getType(eventData.items) === 'array' && eventData.items.length) items = eventData.items;
    else if (
      getType(eventData.ecommerce) === 'object' &&
      getType(eventData.ecommerce.items) === 'array' &&
      eventData.ecommerce.items.length
    ) {
      items = eventData.ecommerce.items;
    }

    if (eventData.content_type) mappedData.properties.content_type = eventData.content_type;
    else if (items) mappedData.properties.content_type = 'product';

    if (eventData.query) mappedData.properties.query = eventData.query;
    if (eventData.search_term || eventData.search_string)
      mappedData.properties.search_string = eventData.search_term || eventData.search_string;
    if (eventData.description) mappedData.properties.description = eventData.description;
    if (eventData.order_id) mappedData.properties.order_id = eventData.order_id;
    if (eventData.shop_id) mappedData.properties.shop_id = eventData.shop_id;

    let currencyFromItems;
    let valueFromItems = 0;

    if (eventData.contents) mappedData.properties.contents = eventData.contents;
    else if (items) {
      currencyFromItems = items[0].currency;
      mappedData.properties.contents = [];

      items.forEach((d) => {
        const item = {};

        if (d.quantity) item.quantity = makeInteger(d.quantity);
        if (isValidValue(d.price)) {
          item.price = makeNumber(d.price);
          valueFromItems += (item.quantity || 1) * item.price;
        }

        const contentId = d.item_id || d.id;
        if (contentId) item.content_id = makeString(contentId);

        const contentCategory = d.content_category || d.item_category;
        if (contentCategory) item.content_category = contentCategory;

        const contentName = d.content_name || d.item_name;
        if (contentName) item.content_name = contentName;

        const brand = d.brand || d.item_brand;
        if (brand) item.brand = brand;

        mappedData.properties.contents.push(item);
      });
    }

    const currency = eventData.currency || currencyFromItems;
    if (currency) mappedData.properties.currency = currency;

    const value =
      makeNumber(eventData.value) ||
      makeNumber(eventData['x-ga-mp1-ev']) ||
      makeNumber(eventData['x-ga-mp1-tr']) ||
      roundValue(valueFromItems);
    if (value) mappedData.properties.value = value;
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.properties[d.name] = d.value;
      }
    });
  }

  if (data.additionalEventPropertiesList) {
    data.additionalEventPropertiesList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.properties[d.name] = d.value;
      }
    });
  }

  mappedData.properties.gtm_version = PARTNER_AGENT_STRING;

  return mappedData;
}

function addUserData(eventData, mappedData, eventSource, ttclid, ttp) {
  mappedData.user = {};

  const autoMapEnabled = data.hasOwnProperty('autoMapUserData') ? data.autoMapUserData : true; // To avoid a breaking change.
  if (autoMapEnabled) {
    let userEventData = {};
    let address = {};
    if (getType(eventData.user_data) === 'object') {
      userEventData = eventData.user_data;
      const addressType = getType(userEventData.address);
      if (addressType === 'object' || addressType === 'array') {
        address = userEventData.address[0] || userEventData.address;
      }
    }

    const email =
      eventData.email ||
      eventData.email_address ||
      userEventData.email ||
      userEventData.email_address ||
      userEventData.sha256_email_address;
    if (email) mappedData.user.email = email;

    const phone =
      eventData.phone ||
      eventData.phone_number ||
      userEventData.phone ||
      userEventData.phone_number ||
      userEventData.sha256_phone_number;
    if (phone) mappedData.user.phone = phone;

    const lastName =
      eventData.lastName ||
      eventData.LastName ||
      eventData.nameLast ||
      eventData.last_name ||
      userEventData.last_name ||
      address.last_name ||
      address.sha256_last_name;
    if (lastName) mappedData.user.last_name = lastName;

    const firstName =
      eventData.firstName ||
      eventData.FirstName ||
      eventData.nameFirst ||
      eventData.first_name ||
      userEventData.first_name ||
      address.first_name ||
      address.sha256_first_name;
    if (firstName) mappedData.user.first_name = firstName;

    const city = eventData.city || address.city;
    if (city) mappedData.user.city = city;

    const state = eventData.state || eventData.region || userEventData.region || address.region;
    if (state) mappedData.user.state = state;

    const zipCode =
      eventData.zip || eventData.postal_code || userEventData.postal_code || address.postal_code;
    if (zipCode) mappedData.user.zip_code = zipCode;

    const country =
      eventData.countryCode || eventData.country || userEventData.country || address.country;
    if (country) mappedData.user.country = country;

    if (eventSource === 'web') {
      const autoMappedttclid = ttclid || eventData.ttclid || userEventData.ttclid;
      if (autoMappedttclid) mappedData.user.ttclid = autoMappedttclid;

      const autoMappedttp = ttp || eventData.ttp || userEventData.ttp;
      if (autoMappedttp) mappedData.user.ttp = autoMappedttp;
    }

    if (eventSource === 'app') {
      const platform = eventData['x-ga-platform'];

      const idfa =
        eventData.idfa ||
        (platform === 'ios' ? eventData['x-ga-resettable_device_id'] : undefined) ||
        userEventData.idfa;
      if (idfa && idfa !== '00000000-0000-0000-0000-000000000000') mappedData.user.idfa = idfa;

      const idfv =
        eventData.idfv ||
        (platform === 'ios' ? eventData['x-ga-vendor_device_id'] : undefined) ||
        userEventData.idfv;
      if (idfv && idfv !== '00000000-0000-0000-0000-000000000000') mappedData.user.idfv = idfv;

      const gaid =
        eventData.gaid ||
        (platform === 'android' ? eventData['x-ga-resettable_device_id'] : undefined) ||
        userEventData.gaid;
      if (gaid && gaid !== '00000000-0000-0000-0000-000000000000') mappedData.user.gaid = gaid;

      const attStatus = eventData.att_status || userEventData.att_status;
      if (attStatus) mappedData.user.att_status = attStatus;
    }

    if (eventSource === 'web' || eventSource === 'crm') {
      const externalId =
        eventData.external_id || eventData.user_id || eventData.userId || userEventData.external_id;
      if (externalId) mappedData.user.external_id = externalId;
    }

    if (eventSource === 'web' || eventSource === 'app') {
      const locale = eventData.locale || userEventData.locale;
      if (locale) mappedData.user.locale = locale;

      const ip = eventData.ip_override || eventData.ip_address || eventData.ip;
      if (ip) mappedData.user.ip = ip;

      if (eventData.user_agent) mappedData.user.user_agent = eventData.user_agent;
    }
  }

  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.user[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function getEventName(data, eventData) {
  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name;

    const gaToEventName = {
      page_view: 'Pageview',
      click: 'ClickButton',
      download: 'Download',
      file_download: 'Download',
      complete_registration: 'CompleteRegistration',
      'gtm.dom': 'Pageview',
      add_payment_info: 'AddPaymentInfo',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      begin_checkout: 'InitiateCheckout',
      generate_lead: 'Lead',
      purchase: 'Purchase',
      search: 'Search',
      view_item: 'ViewContent',

      contact: 'Contact',
      find_location: 'Search',
      submit_application: 'Subscribe',
      subscribe: 'Subscribe',

      'gtm4wp.addProductToCartEEC': 'AddToCart',
      'gtm4wp.productClickEEC': 'ViewContent',
      'gtm4wp.checkoutOptionEEC': 'InitiateCheckout',
      'gtm4wp.checkoutStepEEC': 'AddPaymentInfo',
      'gtm4wp.orderCompletedEEC': 'Purchase'
    };

    if (!gaToEventName[eventName]) {
      return eventName;
    }

    return gaToEventName[eventName];
  }

  return data.eventType === 'custom' ? data.eventNameCustom : data.eventName;
}

function addPageData(mappedData, eventData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapPageData') ? data.autoMapPageData : true; // To avoid a breaking change.

  mappedData.page = {
    url: data.pageLocation || (autoMapEnabled ? eventData.page_location : undefined)
  };

  const pageReferrer =
    data.pageReferrer ||
    (autoMapEnabled ? eventData.page_referrer || eventData.referrer : undefined);
  if (pageReferrer) mappedData.page.referrer = pageReferrer;

  return mappedData;
}

function addAppData(mappedData, eventData) {
  const autoMapAppDataEnabled = data.hasOwnProperty('autoMapAppData') ? data.autoMapAppData : true; // To avoid a breaking change.
  mappedData.app = {
    app_id: data.appId
  };

  const appName = data.appName || (autoMapAppDataEnabled ? eventData.app_name : undefined);
  if (appName) mappedData.app.app_name = appName;

  const appVersion = data.appVersion || (autoMapAppDataEnabled ? eventData.app_version : undefined);
  if (appVersion) mappedData.app.app_version = appVersion;

  const autoMapAdDataEnabled = data.hasOwnProperty('autoMapAdData') ? data.autoMapAdData : true; // To avoid a breaking change.
  let adEventData = {};
  mappedData.ad = {};

  if (autoMapAdDataEnabled) {
    if (getType(eventData.ad) === 'object') {
      adEventData = eventData.ad;
    }

    const callback = adEventData.callback || eventData.callback;
    if (callback) mappedData.ad.callback = callback;

    const campaignId = adEventData.campaign_id || eventData.campaign_id;
    if (campaignId) mappedData.ad.campaign_id = campaignId;

    const adId = adEventData.ad_id || eventData.ad_id;
    if (adId) mappedData.ad.ad_id = adId;

    const creativeId = adEventData.creative_id || eventData.creative_id;
    if (creativeId) mappedData.ad.creative_id = creativeId;

    const isRetargeting = adEventData.is_retargeting || eventData.is_retargeting;
    if (isRetargeting) mappedData.ad.is_retargeting = isRetargeting;

    const attributed = adEventData.attributed || eventData.attributed;
    if (attributed) mappedData.ad.attributed = attributed;

    const attributionType = adEventData.attribution_type || eventData.attribution_type;
    if (attributionType) mappedData.ad.attribution_type = attributionType;

    const attributionProvider = adEventData.attribution_provider || eventData.attribution_provider;
    if (attributionProvider) mappedData.ad.attribution_provider = attributionProvider;
  }

  if (data.adDataList) {
    data.adDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.ad[d.name] = d.value;
      }
    });
  }

  return mappedData;
}

function addLeadData(mappedData) {
  mappedData.lead = {
    lead_id: makeString(data.leadId)
  };

  if (data.leadEventSource) mappedData.lead.lead_event_source = data.leadEventSource;

  return mappedData;
}

function generateTtp() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < 27; i++) {
    const randomIndex = generateRandom(0, characters.length - 1);
    result += characters.charAt(randomIndex);
  }

  return result;
}

function setGtmEecCookie(userData) {
  const gtmeecCookie = {};

  if (userData.email) gtmeecCookie.email = userData.email;
  if (userData.phone) gtmeecCookie.phone = userData.phone;
  if (userData.last_name) gtmeecCookie.last_name = userData.last_name;
  if (userData.first_name) gtmeecCookie.first_name = userData.first_name;
  if (userData.city) gtmeecCookie.city = userData.city;
  if (userData.state) gtmeecCookie.state = userData.state;
  if (userData.zip_code) gtmeecCookie.zip_code = userData.zip_code;
  if (userData.country) gtmeecCookie.country = userData.country;
  if (userData.external_id) gtmeecCookie.external_id = userData.external_id;

  setCookie('_gtmeec-tt', toBase64(JSON.stringify(gtmeecCookie)), {
    domain: getCookieDomain(data),
    path: '/',
    samesite: data.cookieSameSite || 'strict',
    secure: true,
    'max-age': 7776000, // 90 days
    HttpOnly: true
  });
}

function enhanceEventData(userData, eventData) {
  const commonCookie = eventData.common_cookie || {};
  const cookieValue = getCookieValues('_gtmeec-tt')[0] || commonCookie['_gtmeec-tt'];
  if (!cookieValue) return userData;

  const jsonStr = fromBase64(cookieValue);
  if (!jsonStr) return userData;

  const gtmeecData = JSON.parse(jsonStr);

  if (getType(gtmeecData) === 'object') {
    if (!userData.email && gtmeecData.email) userData.email = gtmeecData.email;
    if (!userData.phone && gtmeecData.phone) userData.phone = gtmeecData.phone;
    if (!userData.last_name && gtmeecData.last_name) userData.last_name = gtmeecData.last_name;
    if (!userData.first_name && gtmeecData.first_name) userData.first_name = gtmeecData.first_name;
    if (!userData.city && gtmeecData.city) userData.city = gtmeecData.city;
    if (!userData.state && gtmeecData.state) userData.state = gtmeecData.state;
    if (!userData.zip_code && gtmeecData.zip_code) userData.zip_code = gtmeecData.zip_code;
    if (!userData.country && gtmeecData.country) userData.country = gtmeecData.country;
    if (!userData.external_id && gtmeecData.external_id)
      userData.external_id = gtmeecData.external_id;
  }

  return userData;
}

function generateRequestUrl() {
  return 'https://business-api.tiktok.com/open_api/v' + API_VERSION + '/event/track/';
}

function generateRequestOptions(data) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': data.accessToken
    },
    method: 'POST'
  };
}

function sendRequest(data, mappedData) {
  const requestUrl = generateRequestUrl();
  const requestOptions = generateRequestOptions(data);

  sendHttpRequest(
    requestUrl,
    (statusCode, headers, body) => {
      if (!data.useOptimisticScenario) {
        return statusCode >= 200 && statusCode < 400 ? data.gtmOnSuccess() : data.gtmOnFailure();
      }
    },
    requestOptions,
    JSON.stringify(mappedData)
  );
}

/*==============================================================================
  Helpers
==============================================================================*/

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) {
    data.gtmOnSuccess();
    return true;
  }

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
    data.gtmOnSuccess();
    return true;
  }
}

function getUrl(eventData) {
  return eventData.page_location || getRequestHeader('referer') || eventData.page_referrer;
}

function getCookieDomain(data) {
  return !data.cookieDomain || data.cookieDomain === 'auto'
    ? computeEffectiveTldPlusOne(getEventData('page_location') || getRequestHeader('referer')) ||
        'auto'
    : data.cookieDomain;
}

function roundValue(value) {
  if (!value) return value;
  return Math.round(makeNumber(value) * 100) / 100;
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
