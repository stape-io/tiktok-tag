# TikTok Events API Tag for Google Tag Manager Server Container

TikTok events API tag for Google Tag Manager server container allows sending site or app events and parameters directly to TikTok server using [TikTok Events API](https://ads.tiktok.com/marketing_api/docs?rid=959icq5stjr&id=1701890979375106).

It can be used to track conversion events, collect custom audiences, dynamic product ads, campaigns optimization.

## How to use TikTok tag

TikTok event API tag for server GTM allows sending user data (email, phone number, user ID, user IP, and user agent), properties, objects, and event parameters.
It automatically transforms required information lowercase and hash using SHA256.

TikTok does not support event deduplication, meaning that combining browser and server tracking is currently impossible because the event will be counted twice.

- More about the [TikTok Events API](https://ads.tiktok.com/marketing_api/docs?rid=959icq5stjr&id=1701890979375106).
- Detailed description of the [TikTok event API tag for the GTM server](https://stape.io/how-to-set-up-tiktok-events-api/)

### Getting started

1. Add TikTok events API tag to the Google Tag Manager server container.
2. Use the TikTok developers account to create App ID and API Access token.
3. Add required parameters to the TikTok events API tag inside the server GTM.

More detailed description of setting up the [TikTok events API tag in the sGTM](https://stape.io/how-to-set-up-tiktok-events-api/).

### Supported events

- ViewContent
- ClickButton
- Search
- AddToWishlist
- AddToCart
- InitiateCheckout
- AddPaymentInfo
- CompletePayment
- PlaceAnOrder
- Contact
- Download
- SubmitForm
- CompleteRegistration
- Subscribe

## Open Source

TikTok Events API Tag for GTM Server Side is developing and maintained by [Stape Team](https://stape.io/) under the Apache 2.0 license.
