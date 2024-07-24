# [yaca.systems](https://yaca.systems/) for [alt:V](https://altv.mp/)

This is a example implementation for [alt:V](https://altv.mp/).
Feel free to report bugs via issues or contribute via pull requests.

Join our [Discord](http://discord.yaca.systems/) to get help or make suggestions and start
using [yaca.systems](https://yaca.systems/) today!

# Setup Steps

1. Download and install the latest [release](https://github.com/yaca-systems/altV-yaca-js/archive/refs/heads/master.zip) of this
   resource.
2. Add `'yaca-voice'` into the `ressource` section of your `server.toml`.
3. Rename `server.config.json.example` to `server.config.json` and adjust the [variables](https://github.com/yaca-systems/altV-yaca-js/tree/master?tab=readme-ov-file#server-config) to your needs.
4. Rename `config/config.json.example` to `config.json` and adjust the [variables](https://github.com/yaca-systems/altV-yaca-js/tree/master?tab=readme-ov-file#client-config) to your needs.

# Server Config

| Variable              | Type       | Description                                                                                                            |
|-----------------------|------------|------------------------------------------------------------------------------------------------------------------------|
| YACA_UNIQUE_SERVER_ID        | `string`   | The unique Server Identifier of the Teamspeak-Server                                                                   |
| YACA_CHANNEL_ID       | `number`   | The ID of the Ingame Channel                                                                                           |
| YACA_CHANNEL_PASSWORD | `string`   | The Password used to join the Ingame Channel                                                                           |
| YACA_DEFAULT_CHANNEL_ID      | `number`   | The ID of the Channel where a players should be moved to when leaving Ingame                                           |
| YACA_USE_WHISPER            | `boolean`  | If you want to use the Whisper functions of TeamSpeak, if set to `false` it mutes and unmutes the players - suggested for 500 and more Players              |

# Client Config

| Variable                                | Type       | Description                                                                                                                                                                                                              |
| --------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VehicleMufflingWhitelist                | `string[]` | Whitelist of vehicle models that should not be muffled when sitting inside a car without a window/door open.                                                                                                             |
| UseLocalLipsync                         | `boolean`  | Sync lips via server or client, UseLocalLipsync false is suggested in the most cases          |

# Serverside API

<details>
<summary style="font-size: x-large">Server</summary>

### General

#### `server:yaca:connect(player: alt.Player)`

Connects the player to the YACA system.

| Parameter | Type            | Description       |
| --------- | --------------- | ----------------- |
| player    | `alt.Player`    | the player object |

#### `server:yaca:changePlayerAliveStatus(player: alt.Player, alive: bool)`

Changes the alive status of a player. Used to forcemute player

| Parameter | Type            | Description       |
| --------- | --------------- | ----------------- |
| player    | `alt.Player`    | the player object |
| alive     | `boolean`       | the alive status  |

### Phone

#### `server:yaca:callPlayer(player: alt.Player, target: alt.Player, state: bool)`

Creates a phone call between two players.

| Parameter | Type            | Description              |
| --------- | ---------       | ------------------------ |
| player    | `alt.Player`    | the player source        |
| target    | `alt.Player`    | the target player source |
| state     | `boolean`       | the state of the call    |

#### `server:yaca:callPlayerOldEffect(player: alt.Player, target: alt.Player, state: boolean)`

Creates a phone call between two players with the old effect.

| Parameter | Type            | Description              |
| --------- | ---------       | ------------------------ |
| player    | `alt.Player`    | the player source        |
| target    | `alt.Player`    | the target player source |
| state     | `boolean`       | the state of the call    |

#### `server:yaca:muteOnPhone(player: alt.Player, state: bool, onCallstop: bool)`

Mutes the player when using the phone.

| Parameter | Type      | Description       |
| --------- | --------- | ----------------- |
| player    | `number`  | the player source |
| state     | `boolean` | the mute state    |
| onCallstop| `boolean` | is it on call stop|

#### `server:yaca:enablePhoneSpeaker(player: alt.Player, state: bool)`

Enable or disable the phone speaker for a player.

| Parameter          | Type      | Description             |
| ---------          | --------- | ----------------------- |
| player             | `number`  | the player source       |
| state              | `boolean` | the phone speaker state |
</details>

# Events

<details>
<summary style="font-size: x-large">Client</summary>

#### `YACA:DISCONNECTED_FROM_WEBSOCKET`

Emits when the player disabled the plugin.

#### `YACA:CONNECTED_TO_WEBSOCKET`

Emits when the player enabled the plugin.

#### `YACA:JOINED_INGAME_CHANNEL`

Emits  when the player joined the ingamechannel.

#### `YACA:MOVED_CHANNEL`

Emits when the own player moved into a channel.

| Parameter          | Type      | Description             |
| ---------          | --------- | ----------------------- |
| Type             | `string`  | INGAME_CHANNEL, EXCLUDED_CHANNEL       |

#### `YACA:SOUND_STATE_CHANGED`

Emits when the own player changed the microphone or speaker state.

| Parameter          | Type      | Description             |
| ---------          | --------- | ----------------------- |
| States             | `string`  | Represents the current state of microphone and speaker as json      |
</details>

<details>
<summary style="font-size: x-large">Server</summary>

tbc

</details>

# Developers

If you want to contribute to this project, feel free to do so. We are happy about every contribution. If you have any
questions, feel free to ask in our [Discord](http://discord.yaca.systems/).