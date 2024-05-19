# [yaca.systems](https://yaca.systems/) for [alt:V](https://altv.mp/)

This is a example implementation for [alt:V](https://altv.mp/).
Feel free to report bugs via issues or contribute via pull requests.

Join our [Discord](http://discord.yaca.systems/) to get help or make suggestions and start
using [yaca.systems](https://yaca.systems/) today!

# Setup Steps

1. Download and install the latest [release](https://github.com/yaca-systems/altV-yaca-js/archive/refs/heads/master.zip) of this
   resource.
2. Add `'yaca-voice'` into the `ressource` section of your `server.toml`.
3. Rename `server.config.json.example` to `server.config.json` and adjust the [variables](https://github.com/yaca-systems/altV-yaca-js/blob/main/README.md#server-config) to your
   needs.

# Server Config

| Variable              | Type       | Description                                                                                                            |
|-----------------------|------------|------------------------------------------------------------------------------------------------------------------------|
| YACA_UNIQUE_SERVER_ID        | `string`   | The unique Server Identifier of the Teamspeak-Server                                                                   |
| YACA_CHANNEL_ID       | `number`   | The ID of the Ingame Channel                                                                                           |
| YACA_CHANNEL_PASSWORD | `string`   | The Password used to join the Ingame Channel                                                                           |
| YACA_DEFAULT_CHANNEL_ID      | `number`   | The ID of the Channel where a players should be moved to when leaving Ingame                                           |
| YACA_USE_WHISPER            | `boolean`  | If you want to use the Whisper functions of TeamSpeak, if set to `false` it mutes and unmutes the players - suggested for 500 and more Players              |

# Developers

If you want to contribute to this project, feel free to do so. We are happy about every contribution. If you have any
questions, feel free to ask in our [Discord](http://discord.yaca.systems/).