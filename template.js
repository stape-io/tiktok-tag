const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const sha256Sync = require('sha256Sync');
const makeString = require('makeString');
const getRequestHeader = require('getRequestHeader');
const parseUrl = require('parseUrl');
const decodeUriComponent = require('decodeUriComponent');
const getType = require('getType');
const getTimestampMillis = require('getTimestampMillis');
const Math = require('Math');
const makeInteger = require('makeInteger');
const generateRandom = require('generateRandom');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;
const gtmVersion = 'stape_2_0_1';

const eventData = getAllEventData();
const url = eventData.page_location || getRequestHeader('referer');

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const commonCookie = eventData.common_cookie || {};

let ttclid = getCookieValues('ttclid')[0] || commonCookie.ttclid;
if (!ttclid) ttclid = eventData.ttclid;

let ttp = getCookieValues('_ttp')[0] || commonCookie._ttp;
if (!ttp) ttp = eventData._ttp;
if (!ttp && data.generateTtp) {
  ttp = generateTtp();
}

if (url) {
  const urlParsed = parseUrl(url);

  if (urlParsed && urlParsed.searchParams.ttclid) {
    ttclid = decodeUriComponent(urlParsed.searchParams.ttclid);
  }
}

const apiVersion = '1.3';
const postUrl = 'https://business-api.tiktok.com/open_api/v' + apiVersion + '/event/track/';
const eventName = getEventName(eventData, data);
let postBody = mapEvent(eventData, data);

if (isLoggingEnabled) {
  logToConsole(
    JSON.stringify({
      Name: 'TikTok',
      Type: 'Request',
      TraceId: traceId,
      EventName: eventName,
      RequestMethod: 'POST',
      RequestUrl: postUrl,
      RequestBody: postBody,
    })
  );
}

if (ttclid) {
  setCookie('ttclid', ttclid, {
    domain: 'auto',
    path: '/',
    samesite: 'Lax',
    secure: true,
    'max-age': 2592000, // 30 days
    httpOnly: false,
  });
}

if (ttp) {
  setCookie('_ttp', ttp, {
    domain: 'auto',
    path: '/',
    samesite: 'Lax',
    secure: true,
    'max-age': 34190000, // 13 months
    httpOnly: false,
  });
}

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    if (isLoggingEnabled) {
      logToConsole(
        JSON.stringify({
          Name: 'TikTok',
          Type: 'Response',
          TraceId: traceId,
          EventName: eventName,
          ResponseStatusCode: statusCode,
          ResponseHeaders: headers,
          ResponseBody: body,
        })
      );
    }
    if (!data.useOptimisticScenario) {
      if (statusCode >= 200 && statusCode < 400) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    }
  },
  {
    headers: {
      'Content-Type': 'application/json',
      'Access-Token': data.accessToken,
    },
    method: 'POST',
  },
  JSON.stringify(postBody)
);

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

function mapEvent(eventData, data) {
  let eventSource = data.eventSource || 'web';
  let mappedData = {
    event: eventName,
    event_time: getEventTime(eventData),
  };

  mappedData = addEventId(mappedData, eventData);

  if (eventSource === 'web') {
    addPageData(mappedData, eventData);
  }

  if (eventSource === 'app') {
    addAppData(mappedData, eventData);
  }

  if (eventSource === 'web' || eventSource === 'app') {
    mappedData.limited_data_use = data.limitedDataUse || false;
  }

  mappedData = addUserData(eventData, mappedData, eventSource);
  mappedData = addPropertiesData(eventData, mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  let requestData = {
    event_source: eventSource,
    event_source_id: data.pixelId,
    data: [mappedData],
  };
  const testEventCode = eventData.test_event_code || data.testEventCode;
  if (testEventCode) requestData.test_event_code = testEventCode;

  return requestData;
}

function isHashed(value) {
  if (!value) {
    return false;
  }

  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) {
    return value;
  }

  const type = getType(value);

  if (type === 'undefined' || value === 'undefined') {
    return undefined;
  }

  if (type === 'object') {
    return value.map((val) => {
      return hashData(val);
    });
  }

  if (isHashed(value)) {
    return value;
  }

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex',
  });
}

function hashDataIfNeeded(mappedData) {
  if (mappedData.user) {
    for (let key in mappedData.user) {
      if (key === 'external_id' || key === 'phone' || key === 'email') {
        mappedData.user[key] = hashData(mappedData.user[key]);
      }
    }
  }

  return mappedData;
}

function addPropertiesData(eventData, mappedData) {
  mappedData.properties = {};

  if (eventData.content_type) mappedData.properties.content_type = eventData.content_type;
  else if (eventData.items && eventData.items[0]) mappedData.properties.content_type = 'product';

  if (eventData.currency) mappedData.properties.currency = eventData.currency;

  if (eventData.value) mappedData.properties.value = eventData.value;
  else if (eventData['x-ga-mp1-ev']) mappedData.properties.value = eventData['x-ga-mp1-ev'];
  else if (eventData['x-ga-mp1-tr']) mappedData.properties.value = eventData['x-ga-mp1-tr'];

  if (eventData.query) mappedData.properties.query = eventData.query;
  if (eventData.description) mappedData.properties.description = eventData.description;
  if (eventData.order_id) mappedData.properties.order_id = eventData.order_id;
  if (eventData.shop_id) mappedData.properties.shop_id = eventData.shop_id;

  if (eventData.contents) mappedData.properties.contents = eventData.contents;
  else if (eventData.items && eventData.items[0]) {
    mappedData.properties.contents = [];

    eventData.items.forEach((d, i) => {
      let item = {};

      if (d.price) item.price = d.price;
      if (d.quantity) item.quantity = d.quantity;

      if (d.item_id) item.content_id = d.item_id;
      else if (d.id) item.content_id = d.id;

      if (d.content_category) item.content_category = d.content_category;
      if (d.content_name) item.content_name = d.content_name;
      if (d.brand) item.brand = d.brand;

      mappedData.properties.contents.push(item);
    });
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.properties[d.name] = d.value;
      }
    });
  }

  mappedData.properties.gtm_version = gtmVersion;

  return mappedData;
}

function addUserData(eventData, mappedData, eventSource) {
  mappedData.user = {};
  let userEventData = {};
  let address = {};
  if (getType(eventData.user_data) === 'object') {
    userEventData = eventData.user_data;
    const addressType = getType(userEventData.address);
    if (addressType === 'object' || addressType === 'array') {
      address = userEventData.address[0] || userEventData.address;
    }
  }

  if (eventData.email) mappedData.user.email = eventData.email;
  else if (eventData.email_address) mappedData.user.email = eventData.email_address;
  else if (userEventData.email) mappedData.user.email = userEventData.email;
  else if (userEventData.email_address) mappedData.user.email = userEventData.email_address;

  if (eventData.phone) mappedData.user.phone = eventData.phone;
  else if (eventData.phone_number) mappedData.user.phone = eventData.phone_number;
  else if (userEventData.phone) mappedData.user.phone = userEventData.phone;
  else if (userEventData.phone_number) mappedData.user.phone = userEventData.phone_number;

  if (eventData.lastName) mappedData.user.last_name = eventData.lastName;
  else if (eventData.LastName) mappedData.user.last_name = eventData.LastName;
  else if (eventData.nameLast) mappedData.user.last_name = eventData.nameLast;
  else if (eventData.last_name) mappedData.user.last_name = eventData.last_name;
  else if (userEventData.last_name) mappedData.user.last_name = userEventData.last_name;
  else if (address.last_name) mappedData.user.last_name = address.last_name;

  if (eventData.firstName) mappedData.user.first_name = eventData.firstName;
  else if (eventData.FirstName) mappedData.user.first_name = eventData.FirstName;
  else if (eventData.nameFirst) mappedData.user.first_name = eventData.nameFirst;
  else if (eventData.first_name) mappedData.user.first_name = eventData.first_name;
  else if (userEventData.first_name) mappedData.user.first_name = userEventData.first_name;
  else if (address.first_name) mappedData.user.first_name = address.first_name;

  if (eventData.city) mappedData.user.city = eventData.city;
  else if (address.city) mappedData.user.city = address.city;

  if (eventData.state) mappedData.user.state = eventData.state;
  else if (eventData.region) mappedData.user.state = eventData.region;
  else if (userEventData.region) mappedData.user.state = userEventData.region;
  else if (address.region) mappedData.user.state = address.region;

  if (eventData.zip) mappedData.user.zip_code = eventData.zip;
  else if (eventData.postal_code) mappedData.user.zip_code = eventData.postal_code;
  else if (userEventData.postal_code) mappedData.user.zip_code = userEventData.postal_code;
  else if (address.postal_code) mappedData.user.zip_code = address.postal_code;

  if (eventData.countryCode) mappedData.user.country = eventData.countryCode;
  else if (eventData.country) mappedData.user.country = eventData.country;
  else if (userEventData.country) mappedData.user.country = userEventData.country;
  else if (address.country) mappedData.user.country = address.country;

  if (eventSource === 'web') {
    if (ttclid) mappedData.user.ttclid = ttclid;
    else if (eventData.ttclid) mappedData.user.ttclid = eventData.ttclid;
    else if (userEventData.ttclid) mappedData.user.ttclid = userEventData.ttclid;

    if (ttp) mappedData.user.ttp = ttp;
    else if (eventData.ttp) mappedData.user.ttp = eventData.ttp;
    else if (userEventData.ttp) mappedData.user.ttp = userEventData.ttp;

    if (eventData.external_id) mappedData.user.external_id = eventData.external_id;
    else if (eventData.user_id) mappedData.user.external_id = eventData.user_id;
    else if (eventData.userId) mappedData.user.external_id = eventData.userId;
    else if (userEventData.external_id) mappedData.user.external_id = userEventData.external_id;

    if (eventData.ip_override) mappedData.user.ip = eventData.ip_override;
    else if (eventData.ip_address) mappedData.user.ip = eventData.ip_address;
    else if (eventData.ip) mappedData.user.ip = eventData.ip;

    if (eventData.user_agent) mappedData.user.user_agent = eventData.user_agent;
  }

  if (eventSource === 'app') {
    if (eventData.idfa) mappedData.user.idfa = eventData.idfa;
    else if (userEventData.idfv) mappedData.user.idfv = userEventData.idfv;

    if (eventData.idfv) mappedData.user.idfv = eventData.idfv;
    else if (userEventData.idfv) mappedData.user.idfv = userEventData.idfv;

    if (eventData.gaid) mappedData.user.gaid = eventData.gaid;
    else if (userEventData.gaid) mappedData.user.gaid = userEventData.gaid;

    if (eventData.att_status) mappedData.user.att_status = eventData.att_status;
    else if (userEventData.att_status) mappedData.user.att_status = userEventData.att_status;
  }

  if (eventSource === 'web' || eventSource === 'app') {
    if (eventData.locale) mappedData.user.locale = eventData.locale;
    else if (userEventData.locale) mappedData.user.locale = userEventData.locale;
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

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;

    let gaToEventName = {
      page_view: 'PageView',
      click: 'ClickButton',
      download: 'Download',
      file_download: 'Download',
      complete_registration: 'CompleteRegistration',
      'gtm.dom': 'PageView',
      add_payment_info: 'AddPaymentInfo',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      begin_checkout: 'InitiateCheckout',
      generate_lead: 'SubmitForm',
      purchase: 'CompletePayment',
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
      'gtm4wp.orderCompletedEEC': 'CompletePayment',
    };

    if (!gaToEventName[eventName]) {
      return eventName;
    }

    return gaToEventName[eventName];
  }

  return data.eventType === 'custom' ? data.eventNameCustom : data.eventName;
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(containerVersion && (containerVersion.debugMode || containerVersion.previewMode));

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function addEventId(mappedData, eventData) {
  if (data.eventId) mappedData.event_id = data.eventId;
  else if (eventData.event_id) mappedData.event_id = eventData.event_id;
  else if (eventData.transaction_id) mappedData.event_id = eventData.transaction_id;

  return mappedData;
}

function getEventTime(eventData) {
  if (data.eventTime) return makeInteger(data.eventTime);
  else if (eventData.event_time) return makeInteger(eventData.event_time);

  return Math.round(getTimestampMillis() / 1000);
}

function addPageData(mappedData, eventData) {
  mappedData.page = {
    url: data.pageLocation || eventData.page_location,
  };

  if (data.pageReferrer) mappedData.page.referrer = data.pageReferrer;
  else if (eventData.page_referrer) mappedData.page.referrer = eventData.page_referrer;
  else if (eventData.referrer) mappedData.page.referrer = eventData.referrer;

  return mappedData;
}

function addAppData(mappedData, eventData) {
  mappedData.app = {
    app_id: data.appId,
  };

  if (data.appName) mappedData.app.app_name = data.appName;
  else if (eventData.app_name) mappedData.app.app_name = eventData.app_name;

  if (data.appVersion) mappedData.app.app_version = data.appVersion;
  else if (eventData.app_version) mappedData.app.app_version = eventData.app_version;

  let adEventData = {};
  mappedData.ad = {};

  if (getType(eventData.ad) === 'object') {
    adEventData = eventData.ad;
  }

  if (adEventData.callback) mappedData.ad.callback = adEventData.callback;
  else if (eventData.callback) mappedData.ad.callback = eventData.callback;

  if (adEventData.campaign_id) mappedData.ad.campaign_id = adEventData.campaign_id;
  else if (eventData.campaign_id) mappedData.ad.campaign_id = eventData.campaign_id;

  if (adEventData.ad_id) mappedData.ad.ad_id = adEventData.ad_id;
  else if (eventData.ad_id) mappedData.ad.ad_id = eventData.ad_id;

  if (adEventData.creative_id) mappedData.ad.creative_id = adEventData.creative_id;
  else if (eventData.creative_id) mappedData.ad.creative_id = eventData.creative_id;

  if (adEventData.is_retargeting) mappedData.ad.is_retargeting = adEventData.is_retargeting;
  else if (eventData.is_retargeting) mappedData.ad.is_retargeting = eventData.is_retargeting;

  if (adEventData.attributed) mappedData.ad.attributed = adEventData.attributed;
  else if (eventData.attributed) mappedData.ad.attributed = eventData.attributed;

  if (adEventData.attribution_type) mappedData.ad.attribution_type = adEventData.attribution_type;
  else if (eventData.attribution_type) mappedData.ad.attribution_type = eventData.attribution_type;

  if (adEventData.attribution_provider) mappedData.ad.attribution_provider = adEventData.attribution_provider;
  else if (eventData.attribution_provider) mappedData.ad.attribution_provider = eventData.attribution_provider;

  if (data.adDataList) {
    data.adDataList.forEach((d) => {
      if (isValidValue(d.value)) {
        mappedData.ad[d.name] = d.value;
      }
    });
  }

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

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}
