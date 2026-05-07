# TikTok Events API Tag for Google Tag Manager Server Container

The **TikTok Events API** tag for Google Tag Manager server container allows sending site or app events and parameters directly to TikTok server using [TikTok Events API](https://ads.tiktok.com/marketing_api/docs?rid=959icq5stjr&id=1701890979375106).

It can be used to track conversion events, collect custom audiences, dynamic product ads, campaigns optimization.

## How to use TikTok tag

The **TikTok Events API tag for GTM Server Side** allows sending user data (email, phone number, user ID, user IP, and user agent), properties, objects, and event parameters.
It automatically converts the required information to lowercase and hashes it using SHA-256.

- More about the [TikTok Events API](https://business-api.tiktok.com/portal/docs?id=1771100779668482).
- Detailed description of the [TikTok event API tag for the GTM server](https://stape.io/how-to-set-up-tiktok-events-api/)

### Getting started

1. Add **TikTok Events API tag** to the Google Tag Manager server container.
2. Create a Data Source in TikTok Events Manager.
3. Add the required parameters to the **TikTok Events API tag** tag inside the server GTM.

More detailed description of setting up the [TikTok events API tag in the sGTM](https://stape.io/how-to-set-up-tiktok-events-api/).

### Supported events

- `AddPaymentInfo`
- `AddToCart`
- `AddToWishlist`
- `ApplicationApproval`
- `CompleteRegistration`
- `Contact`
- `CustomizeProduct`
- `Download`
- `FindLocation`
- `InitiateCheckout`
- `Lead`
- `Pageview`
- `Purchase`
- `Schedule`
- `Search`
- `StartTrial`
- `SubmitApplication`
- `Subscribe`
- `ViewContent`
- `CompletePayment` (legacy - Use `Purchase` instead)
- `SubmitForm` (legacy - Use `Lead` instead)
- `ClickButton` (deprecated)
- `PlaceAnOrder` (deprecated)

## Useful Resources

- [How to set up TikTok Events API](https://stape.io/helpdesk/documentation/how-to-set-up-tiktok-events-api)

## Open Source

The **TikTok Events API Tag for GTM Server Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.

### GTM Gallery Status
🟢 [Listed](https://tagmanager.google.com/gallery/#/owners/stape-io/templates/tiktok-tag)
