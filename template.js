const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const getTimestampMillis = require('getTimestampMillis');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const sha256Sync = require('sha256Sync');
const makeString = require('makeString');
const getRequestHeader = require('getRequestHeader');

const containerVersion = getContainerVersion();
const isDebug = containerVersion.debugMode;
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

const eventData = getAllEventData();

let ttclid = getCookieValues('ttclid')[0];
if (!ttclid) ttclid = eventData.ttclid;
if (!ttclid) {
    let url = eventData.page_location;

    if (url && url.indexOf('ttclid=') !== -1) {
        ttclid = url.split('ttclid=')[1].split('&')[0];
    }
}

const apiVersion = '1.2';
const postUrl = 'https://business-api.tiktok.com/open_api/v' + apiVersion + '/pixel/track/';
let postBody = mapEvent(eventData, data);

if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
        'Name': 'TikTok',
        'Type': 'Request',
        'TraceId': traceId,
        'EventName': postBody.event,
        'RequestMethod': 'POST',
        'RequestUrl': postUrl,
        'RequestBody': postBody,
    }));
}

sendHttpRequest(postUrl, (statusCode, headers, body) => {
    if (isLoggingEnabled) {
        logToConsole(JSON.stringify({
            'Name': 'TikTok',
            'Type': 'Response',
            'TraceId': traceId,
            'EventName': postBody.event,
            'ResponseStatusCode': statusCode,
            'ResponseHeaders': headers,
            'ResponseBody': body,
        }));
    }

    if (statusCode >= 200 && statusCode < 400) {
        if (ttclid) {
            setCookie('ttclid', ttclid, {
                domain: 'auto',
                path: '/',
                samesite: 'Lax',
                secure: true,
                'max-age': 2592000, // 30 days
                httpOnly: false
            });
        }

        data.gtmOnSuccess();
    } else {
        data.gtmOnFailure();
    }
}, {headers: {'Content-Type': 'application/json', 'Access-Token': data.accessToken}, method: 'POST', timeout: 3500}, JSON.stringify(postBody));

function mapEvent(eventData, data) {
    let mappedData = {
        "pixel_code": data.pixelId,
        "event": data.eventName,
        "timestamp": makeString(getTimestampMillis()),
        "context": {
            "page": {
                "url": eventData.page_location
            },
            "user_agent": eventData.user_agent,
            "ip": eventData.ip_override
        }
    };

    if (ttclid) {
        mappedData.context.ad = {"callback": ttclid};
    }

    if (data.testEventCode){
        mappedData.test_event_code = data.testEventCode;
    }

    mappedData = addServerEventData(eventData, data, mappedData);
    mappedData = addUserData(eventData, mappedData);
    mappedData = addPropertiesData(eventData, mappedData);
    mappedData = hashDataIfNeeded(mappedData);

    return mappedData;
}

function isHashed(value) {
    return value.match('^[A-Fa-f0-9]{64}$') !== null;
}


function hashData(value) {
    if (!value) {
        return value;
    }

    if (isHashed(value)) {
        return value;
    }

    return sha256Sync(value.trim().toLowerCase(), {outputEncoding: 'hex'});
}


function hashDataIfNeeded(mappedData) {
    if (mappedData.context.user) {
        for (let key in mappedData.context.user) {
            if (key === 'external_id' || key === 'phone_number' || key === 'email') {
                mappedData.context.user[key] = hashData(mappedData.context.user[key]);
            }
        }
    }

    return mappedData;
}

function addPropertiesData(eventData, mappedData) {
    let customDataList = {};

    if (eventData['x-ga-mp1-ev']) customDataList.value = eventData['x-ga-mp1-ev'];
    else if (eventData['x-ga-mp1-tr']) customDataList.value = eventData['x-ga-mp1-tr'];
    else if (eventData.value) customDataList.value = eventData.value;

    if (eventData.currency) customDataList.currency = eventData.currency;
    if (eventData.description) customDataList.description = eventData.description;
    if (eventData.query) customDataList.query = eventData.query;

    if (eventData.items && eventData.items[0]) {
        customDataList.contents = [];

        eventData.items.forEach((d,i) => {
            let item = {};

            if (d.item_id) item.content_id = d.item_id;
            else if (d.id) item.content_id = d.id;

            if (d.quantity) item.quantity = d.quantity;
            if (d.price) item.price = d.price;
            if (d.content_type) item.content_type = d.content_type;

            customDataList.contents.push(item);
        });
    }

    if (data.customDataList) {
        data.customDataList.forEach(d => {
            customDataList[d.name] = d.value;
        });
    }

    if (customDataList) {
        mappedData.properties = {};

        if (customDataList.contents) mappedData.properties.contents = customDataList.contents;
        if (customDataList.currency) mappedData.properties.currency = customDataList.currency;
        if (customDataList.description) mappedData.properties.description = customDataList.description;
        if (customDataList.query) mappedData.properties.query = customDataList.query;
        if (customDataList.value) mappedData.properties.value = customDataList.value;
    }

    return mappedData;
}

function addUserData(eventData, mappedData) {
    let userDataList = {};

    if (eventData.external_id) userDataList.external_id = eventData.external_id;
    else if (eventData.user_id) userDataList.external_id = eventData.user_id;
    else if (eventData.userId) userDataList.external_id = eventData.userId;

    if (eventData.email) userDataList.email = eventData.email;
    else if (eventData.user_data && eventData.user_data.email_address) userDataList.email = eventData.user_data.email_address;

    if (eventData.phone) userDataList.phone_number = eventData.phone;
    else if (eventData.user_data && eventData.user_data.phone_number) userDataList.phone_number = eventData.user_data.phone_number;

    if (data.userDataList) {
        data.userDataList.forEach(d => {
            userDataList[d.name] = d.value;
        });
    }

    if (userDataList) {
        mappedData.context.user = {};

        if (userDataList.external_id) mappedData.context.user.external_id = userDataList.external_id;
        if (userDataList.phone_number) mappedData.context.user.phone_number = userDataList.phone_number;
        if (userDataList.email) mappedData.context.user.email = userDataList.email;
    }

    return mappedData;
}


function addServerEventData(eventData, data, mappedData) {
    let serverEventDataList = {};

    if (eventData.event_id) serverEventDataList.event_id = eventData.event_id;
    else if (eventData.transaction_id) serverEventDataList.event_id = eventData.transaction_id;

    if (eventData.page_referrer) serverEventDataList.referrer = eventData.page_referrer;

    if (data.serverEventDataList) {
        data.serverEventDataList.forEach(d => {
            serverEventDataList[d.name] = d.value;
        });
    }

    if (serverEventDataList) {
        if (serverEventDataList.url) mappedData.context.page.url = serverEventDataList.url;
        if (serverEventDataList.referrer) mappedData.context.page.referrer = serverEventDataList.referrer;

        if (serverEventDataList.timestamp) mappedData.timestamp = serverEventDataList.timestamp;
        if (serverEventDataList.event_id) mappedData.event_id = serverEventDataList.event_id;
    }

    return mappedData;
}

function determinateIsLoggingEnabled() {
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
