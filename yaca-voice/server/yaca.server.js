import * as alt from 'alt-server';
import config from '../server.config.json' assert { type: 'json' };
import sharedConfig from '../shared.config.json' assert { type: 'json' };

//For typescript users
/*
declare module "alt-server" {
    export interface Colshape {
        voiceRangeInfos: {
            maxRange: number,
        }
    }

    export interface Player {
        voiceSettings: {
            voiceRange: number,
            voiceFirstConnect: boolean,
            forceMuted: boolean,
            ingameName: string,
        };

        voiceplugin: {
            clientId: number,
            forceMuted: boolean,
            range: number,
            playerId: number
        }

        radioSettings: {
            activated: boolean,
            currentChannel: number,
            hasLong: boolean,
            frequencies: { [key: number]: string }
        };
    }
}
*/

const settings = {
    // Max Radio Channels
    maxRadioChannels: parseInt(config.YACA_MAX_RADIO_CHANNELS) || 9, // needs to be sync with client setting

    // Unique Teamspeakserver ID
    UNIQUE_SERVER_ID: config.YACA_UNIQUE_SERVER_ID || "",

    // Ingame Voice Channel ID
    CHANNEL_ID: parseInt(config.YACA_CHANNEL_ID) || 0,

    // Ingame Voice Channel Password
    CHANNEL_PASSWORD: config.YACA_CHANNEL_PASSWORD || "",

    // Default Teamspeak Channel, if player can't be moved back to his old channel
    DEFAULT_CHANNEL_ID: parseInt(config.YACA_DEFAULT_CHANNEL_ID) || 1,

    // Use whisper system
    USE_WHISPER: sharedConfig.UseWhisper || false,

    PHONESPEAKER_BOTH_DIRECTIONS: sharedConfig.PhoneSpeakerHearBothDirections || false,
}

/**
 * Generates a random string of a given length.
 *
 * @param {number} [length=50] - The length of the string to generate. Defaults to 50 if not provided.
 * @param {string} [possible="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"] - The characters to use in the string. Defaults to all alphanumeric characters if not provided.
 * @returns {string} The generated random string.
 */
function generateRandomString(length = 50, possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
    let text = "";
    for (let i = 0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

export class YaCAServerModule {
    static instance;
    static nameSet = new Set();
    static voiceRangesColShapes = new Map();

    static radioFrequencyMap = new Map();

    constructor() {
        if (!settings.UNIQUE_SERVER_ID || settings.UNIQUE_SERVER_ID == "") {
            throw Error('~r~ --> YaCA: Unique Server ID is not set! Please set it in your .env file');
        }

        this.registerEvents();
        alt.log('~g~ --> YaCA: Server loaded');
    }

    /**
     * Gets the singleton of YaCAServerModule.
     *
     * @returns {YaCAServerModule} The singleton instance of YaCAServerModule.
     */
    static getInstance() {
        if (!this.instance) {
            this.instance = new YaCAServerModule();
        }

        return this.instance;
    }

    /**
     * Generate a random name and insert it into the database.
     *
     * @param {alt.Player} player - The player for whom to generate a random name.
     */
    generateRandomName(player) {
        let name;
        for (let i = 0; i < 100; i++) {
            let generatedName = generateRandomString(15, "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789");
            if (!YaCAServerModule.nameSet.has(name)) {
                name = generatedName;
                YaCAServerModule.nameSet.add(name);
                break;
            }
        }

        if (!name && player.valid) player.sendMessage("Fehler bei der Teamspeaknamens findung, bitte reconnecte!");

        return name;
    }

    /**
     * Initialize the player on first connect.
     *
     * @param {alt.Player} player - The player to connect to voice.
     */
    connectToVoice(player) {
        if (!player?.valid) return;

        const name = this.generateRandomName(player);
        if (!name) return;

        player.voiceSettings = {
            voiceRange: 3,
            voiceFirstConnect: false,
            forceMuted: false,
            ingameName: name,
            mutedOnPhone: false,
            inCallWith: new Set(),
            emittedPhoneSpeaker: new Set()
        };

        player.radioSettings = {
            activated: false,
            currentChannel: 1,
            hasLong: false,
            frequencies: {} //{ [key: number]: string }
        };

        this.connect(player);
    }

    registerEvents() {
        // alt:V Events
        alt.on("playerDisconnect", this.handlePlayerDisconnect.bind(this));
        alt.on("playerLeftVehicle", this.handlePlayerLeftVehicle.bind(this));

        //Events if called from other serverside ressource
        alt.on("server:yaca:connect", this.connectToVoice.bind(this));
        alt.on("server:yaca:callPlayer", this.callPlayer.bind(this));
        alt.on("server:yaca:callPlayerOldEffect", this.callPlayerOldEffect.bind(this));
        alt.on("server:yaca:changePlayerAliveStatus", this.changePlayerAliveStatus.bind(this));
        alt.on("server:yaca:enablePhoneSpeaker", this.enablePhoneSpeaker.bind(this));
        alt.on("server:yaca:muteOnPhone", this.muteOnPhone.bind(this));

        // YaCA: voice range toggle
        alt.onClient("server:yaca:changeVoiceRange", this.changeVoiceRange.bind(this));

        // YACA: Playerlipsync
        alt.onClient("server:yaca:lipsync", (player, state) => {
            player.setStreamSyncedMeta("yaca:lipsync", state);
        });

        // YaCA:successful voice connection and client-id sync
        alt.onClient("server:yaca:addPlayer", this.addNewPlayer.bind(this));

        // YaCA: Change megaphone state by player
        alt.onClient("server:yaca:useMegaphone", this.playerUseMegaphone.bind(this));

        // YaCA: Triggers if voiceplugin is for x amount of time not connected
        alt.onClient("server:yaca:noVoicePlugin", this.playerNoVoicePlugin.bind(this));

        //YaCa: voice restart
        alt.onClient("server:yaca:wsReady", this.playerReconnect.bind(this));

        //YaCA: Enable radio
        alt.onClient("server:yaca:enableRadio", (player, state) => {
            this.enableRadio(player, state)
        });

        //YaCA-Radio: Change radio channel frequency
        alt.onClient("server:yaca:changeRadioFrequency", (player, channel, frequency) => {
            this.changeRadioFrequency(player, channel, frequency)
        });

        //YaCA-Radio: Mute a radio channel
        alt.onClient("server:yaca:muteRadioChannel", (player, channel) => {
            this.radioChannelMute(player, channel)
        });

        //YaCA-Radio: Talk in radio channel
        alt.onClient("server:yaca:radioTalking", (player, state, distanceToTowerFromSender = -1) => {
            this.radioTalkingState(player, state, distanceToTowerFromSender)
        });

        //YaCA-Radio: Change active radio channel
        alt.onClient("server:yaca:changeActiveRadioChannel", (player, channel) => {
            this.radioActiveChannelChange(player, channel)
        });

        alt.onClient("server:yaca:phoneSpeakerEmitWhisper", (player, enableForTargets, disableForTargets) => {
            const enableReceive = [];
            const disableReceive = [];

            player.voiceSettings.inCallWith.forEach(callTarget => {
                const target = alt.Player.getByID(callTarget);
                if (!target?.valid) return;

                if (enableForTargets?.length) enableReceive.push(target);
                if (disableForTargets?.length) disableReceive.push(target);
            });

            if (enableReceive.length) alt.emitClientRaw(enableReceive, "client:yaca:playersToPhoneSpeakerEmitWhisper", enableForTargets, true);
            if (disableReceive.length) alt.emitClientRaw(disableReceive, "client:yaca:playersToPhoneSpeakerEmitWhisper", disableForTargets, false);
        });

        alt.onClient("server:yaca:phoneSpeakerEmit", (player, enableForTargets, disableForTargets) => {
            if (!settings.PHONESPEAKER_BOTH_DIRECTIONS) return;

            const enableReceive = [];
            const disableReceive = [];

            if (enableForTargets?.length) {
                player.voiceSettings.inCallWith.forEach(callTarget => {
                    const target = alt.Player.getByID(callTarget);
                    if (!target?.valid) return;
    
                    enableReceive.push(target);

                    enableForTargets.forEach(targetID => {
                        const map = player.voiceSettings.emittedPhoneSpeaker;
                        const set = map.get(targetID) ?? (map.set(targetID, new Set()), map.get(targetID));
                        set.add(callTarget);
                    });
                });
            }

            if (disableForTargets?.length) {
                disableForTargets.forEach(targetID => {
                    player.voiceSettings.emittedPhoneSpeaker.get(targetID)?.forEach(emittedTarget => {
                        const target = alt.Player.getByID(emittedTarget);
                        if (!target?.valid) return;

                        disableReceive.push(target);
                    });

                    player.voiceSettings.emittedPhoneSpeaker.delete(targetID);
                });
            }
            
            if (enableReceive.length) alt.emitClientRaw(enableReceive, "client:yaca:phone", enableForTargets, true);
            if (disableReceive.length) alt.emitClientRaw(disableReceive, "client:yaca:phone", disableForTargets, false);
        });

        alt.onClient("server:yaca:muteOnPhone", this.muteOnPhone.bind(this));
        alt.onClient("server:yaca:enablePhoneSpeaker", this.enablePhoneSpeaker.bind(this));
    }

    /**
     * Handle various cases if player disconnects.
     *
     * @param {alt.Player} player - The player who disconnected.
     */
    handlePlayerDisconnect(player) {
        const playerID = player.id;
        YaCAServerModule.nameSet.delete(player.voiceSettings?.ingameName);

        const allFrequences = YaCAServerModule.radioFrequencyMap;
        for (const [key, value] of allFrequences) {
            value.delete(playerID);
            if (!value.size) YaCAServerModule.radioFrequencyMap.delete(key)
        }

        alt.emitAllClientsRaw("client:yaca:disconnect", player.id);
    }

    /**
     * Handle various cases if player left a vehicle.
     *
     * @param {alt.Player} player - The player who left the vehicle.
     * @param {alt.Vehicle} vehicle - The vehicle that the player left.
     * @param {number} seat - The seat number that the player was in.
     */
    handlePlayerLeftVehicle(player, vehicle, seat) {
        YaCAServerModule.changeMegaphoneState(player, false, true);
    }

    /**
     * Syncs player alive status and mute him if he is dead or whatever.
     *
     * @param {alt.Player} player - The player whose alive status is to be changed.
     * @param {boolean} alive - The new alive status.
     */
    changePlayerAliveStatus(player, alive) {
        player.voiceSettings.forceMuted = !alive;
        alt.emitAllClientsRaw("client:yaca:muteTarget", player.id, !alive);

        if (player.voiceplugin) player.voiceplugin.forceMuted = !alive;
    }

    /**
     * Apply the megaphone effect on a specific player via client event.
     *
     * @param {alt.Player} player - The player to apply the megaphone effect on.
     * @param {boolean} state - The state of the megaphone effect.
     */
    playerUseMegaphone(player, state) {
        if (!player.vehicle && !player.hasLocalMeta("canUseMegaphone")) return;
        if (player.vehicle && (!player.vehicle.valid || [1, 2].indexOf(player.seat) == -1)) return;
        if ((!state && !player?.hasStreamSyncedMeta("yaca:megaphoneactive")) || (state && player?.hasStreamSyncedMeta("yaca:megaphoneactive"))) return;

        YaCAServerModule.changeMegaphoneState(player, state);
    }

    /**
     * Apply the megaphone effect on a specific player.
     *
     * @param {alt.Player} player - The player to apply the megaphone effect on.
     * @param {boolean} state - The state of the megaphone effect.
     * @param {boolean} [forced=false] - Whether the change is forced. Defaults to false if not provided.
     */
    static changeMegaphoneState(player, state, forced = false) {
        if (!state && player.hasStreamSyncedMeta("yaca:megaphoneactive")) {
            player.deleteStreamSyncedMeta("yaca:megaphoneactive");
            if (forced) player.setLocalMeta("lastMegaphoneState", false);
        } else if (state && !player.hasStreamSyncedMeta("yaca:megaphoneactive")) {
            player.setStreamSyncedMeta("yaca:megaphoneactive", 30);
        }
    }

    /**
     * Kick player if he doesn't have the voice plugin activated.
     *
     * @param {alt.Player} player - The player to check for the voice plugin.
     */
    playerNoVoicePlugin(player) {
        if (player?.valid) player.kick("Dein Voiceplugin war nicht aktiviert!");
    }

    /**
     * Used if a player reconnects to the server.
     *
     * @param {alt.Player} player - The player who reconnected.
     * @param {boolean} isFirstConnect - Whether this is the player's first connection.
     */
    playerReconnect(player, isFirstConnect) {
        if (!player?.valid || !player.voiceSettings.voiceFirstConnect) return;

        if (!isFirstConnect) {
            const name = this.generateRandomName(player);
            if (!name) return;

            YaCAServerModule.nameSet.delete(player.voiceSettings?.ingameName);
            player.voiceSettings.ingameName = name;
        }

        this.connect(player);
    }

    /**
     * Change the voice range of a player.
     *
     * @param {alt.Player} player - The player whose voice range is to be changed.
     * @param {number} range - The new voice range.
     */
    changeVoiceRange(player, range) {
        player.voiceSettings.voiceRange = range;
        player.setStreamSyncedMeta("yaca:voicerange", player.voiceSettings.voiceRange);

        if (player.voiceplugin) player.voiceplugin.range = range;
    }

    /**
     * Sends initial data needed to connect to teamspeak plugin.
     *
     * @param {alt.Player} player - The player to connect.
     */
    connect(player) {
        player.voiceSettings.voiceFirstConnect = true;

        player.emitRaw("client:yaca:init", {
            suid: settings.UNIQUE_SERVER_ID,
            chid: settings.CHANNEL_ID,
            deChid: settings.DEFAULT_CHANNEL_ID,
            channelPassword: settings.CHANNEL_PASSWORD,
            ingameName: player.voiceSettings.ingameName
        });
    }

    /**
     * Add new player to all other players on connect or reconnect, so they know about some variables.
     *
     * @param {alt.Player} player - The player to add.
     * @param {number} clientId - The client ID of the player.
     */
    addNewPlayer(player, clientId) {
        if (!player?.valid || !clientId) return;

        player.voiceplugin = {
            clientId: clientId,
            forceMuted: player.voiceSettings.forceMuted,
            range: player.voiceSettings.voiceRange,
            playerId: player.id,
            mutedOnPhone: player.voiceSettings.mutedOnPhone
        };

        player.setStreamSyncedMeta("yaca:voicerange", player.voiceSettings.voiceRange);

        alt.emitAllClientsRaw("client:yaca:addPlayers", player.voiceplugin);

        const allPlayers = alt.Player.all;
        let allPlayersData = [];
        for (const playerServer of allPlayers) {
            if (!playerServer.voiceplugin || playerServer.id == player.id) continue;

            allPlayersData.push(playerServer.voiceplugin);
        }

        player.emitRaw("client:yaca:addPlayers", allPlayersData);
    }

    /* ======================== RADIO SYSTEM ======================== */
    /**
     * Checks if a player is permitted to use long radio.
     *
     * @param {alt.Player} player - The player to check.
     */
    static isLongRadioPermitted(player) {
        player.radioSettings.hasLong = true //Add some checks if you want shortrange system;
    }

    /**
     * Enable or disable the radio for a player.
     *
     * @param {alt.Player} player - The player to enable or disable the radio for.
     * @param {boolean} state - The new state of the radio.
     */
    enableRadio(player, state) {
        if (!player?.valid) return;

        player.radioSettings.activated = state;
        YaCAServerModule.isLongRadioPermitted(player);
    }

    /**
     * Change the radio frequency for a player.
     *
     * @param {alt.Player} player - The player to change the radio frequency for.
     * @param {number} channel - The channel to change the frequency of.
     * @param {string} frequency - The new frequency.
     */
    changeRadioFrequency(player, channel, frequency) {
        if (!player?.valid) return;
        if (!player.radioSettings.activated) return player.sendMessage("Das Funkgerät ist aus!");
        if (isNaN(channel) || channel < 1 || channel > settings.maxRadioChannels) return player.sendMessage("Fehlerhafter Funk Kanal!");

        // Leave radiochannel if frequency is 0
        if (frequency == "0") return YaCAServerModule.getInstance().leaveRadioFrequency(player, channel, frequency);

        if (player.radioSettings.frequencies[channel] != frequency){
            YaCAServerModule.getInstance().leaveRadioFrequency(player, channel, player.radioSettings.frequencies[channel]);
        }

        // Add player to channel map, so we know who is in which channel
        if (!YaCAServerModule.radioFrequencyMap.has(frequency)) YaCAServerModule.radioFrequencyMap.set(frequency, new Map());
        YaCAServerModule.radioFrequencyMap.get(frequency).set(player.id, { muted: false });

        player.radioSettings.frequencies[channel] = frequency;

        player.emitRaw("client:yaca:setRadioFreq", channel, frequency)

        //TODO: Add radio effect to player in new frequency
        // const newPlayers = this.getPlayersInRadioFrequency(frequency);
        // if (newPlayers.length) alt.emitClientRaw(newPlayers, "client:yaca:setRadioEffectInFrequency", frequency, player.id);
    }

    /**
     * Make a player leave a radio frequency.
     *
     * @param {alt.Player} player - The player to make leave the radio frequency.
     * @param {number} channel - The channel to leave.
     * @param {string} frequency - The frequency to leave.
     */
    leaveRadioFrequency(player, channel, frequency) {
        if (!player?.valid) return;

        frequency = frequency == "0" ? player.radioSettings.frequencies[channel] : frequency;

        if (!YaCAServerModule.radioFrequencyMap.has(frequency)) return;

        const allPlayersInChannel = YaCAServerModule.radioFrequencyMap.get(frequency);

        player.radioSettings.frequencies[channel] = "0";

        let players = [];
        let allTargets = [];
        for (const [key, value] of allPlayersInChannel) {
            const target = alt.Player.getByID(key)
            if (!target?.valid) continue;

            players.push(target);

            if (key == player.id) continue;

            allTargets.push(target.id);
        }

        if (!settings.USE_WHISPER && players.length) alt.emitClientRaw(players, "client:yaca:leaveRadioChannel", player.voiceplugin.clientId, frequency);
        if (settings.USE_WHISPER) alt.emitClientRaw(player, "client:yaca:radioTalking", allTargets, frequency, false, null, true);

        allPlayersInChannel.delete(player.id);
        if (!YaCAServerModule.radioFrequencyMap.get(frequency).size) YaCAServerModule.radioFrequencyMap.delete(frequency)
    }

    /**
     * Mute a radio channel for a player.
     *
     * @param {alt.Player} player - The player to mute the radio channel for.
     * @param {number} channel - The channel to mute.
     */
    radioChannelMute(player, channel) {
        if (!player?.valid) return;

        const radioFrequency = player.radioSettings.frequencies[channel];
        const foundPlayer = YaCAServerModule.radioFrequencyMap.get(radioFrequency)?.get(player.id);
        if (!foundPlayer) return;

        foundPlayer.muted = !foundPlayer.muted;
        player.emitRaw("client:yaca:setRadioMuteState", channel, foundPlayer.muted)
    }

    /**
     * Change the active radio channel for a player.
     *
     * @param {alt.Player} player - The player to change the active radio channel for.
     * @param {number} channel - The new active channel.
     */
    radioActiveChannelChange(player, channel) {
        if (!player?.valid || isNaN(channel) || channel < 1 || channel > settings.maxRadioChannels) return;

        player.radioSettings.currentChannel = channel;
    }

    /**
     * Change the talking state of a player on the radio.
     *
     * @param {alt.Player} player - The player to change the talking state for.
     * @param {boolean} state - The new talking state.
     */
    radioTalkingState(player, state, distanceToTowerFromSender) {
        if (!player?.valid) return;
        if (!player.radioSettings.activated) return;

        const radioFrequency = player.radioSettings.frequencies[player.radioSettings.currentChannel];
        if (!radioFrequency) return;

        const playerID = player.id;

        const getPlayers = YaCAServerModule.radioFrequencyMap.get(radioFrequency);
        let targets = [];
        let targetsToSender = [];
        let radioInfos = {} //as { [key: number]: { shortRange: boolean }};
        for (const [key, values] of getPlayers) {
            if (values.muted) {
                if (key == player.id) {
                    targets = [];
                    break;
                }
                continue;
            }

            if (key == playerID) continue;

            const target = alt.Player.getByID(key)
            if (!target?.valid || !target.radioSettings.activated) continue;

            const shortRange = !player.radioSettings.hasLong && !target.radioSettings.hasLong;
            if ((player.radioSettings.hasLong && target.radioSettings.hasLong)
                || shortRange
            ) {
                targets.push(target);

                radioInfos[target.id] = {
                    shortRange: shortRange,
                }

                targetsToSender.push(target.id);
            }
        }

        if (targets.length) alt.emitClientRaw(targets, "client:yaca:radioTalking", player.id, radioFrequency, state, radioInfos, false, distanceToTowerFromSender);
        if (settings.USE_WHISPER) alt.emitClientRaw(player, "client:yaca:radioTalking", targetsToSender, radioFrequency, state, radioInfos, true)
    };

    /* ======================== PHONE SYSTEM ======================== */
    /**
     * Call another player.
     *
     * @param {alt.Player} player - The player who is making the call.
     * @param {alt.Player} target - The player who is being called.
     * @param {boolean} state - The state of the call.
     */
    callPlayer(player, target, state) {
        if (!player?.valid || !target?.valid) return;

        alt.emitClientRaw(target, "client:yaca:phone", player.id, state);
        alt.emitClientRaw(player, "client:yaca:phone", target.id, state);

        if (state) {
            player.voiceSettings.inCallWith.add(target.id);
            target.voiceSettings.inCallWith.add(player.id);
            if (player.hasStreamSyncedMeta("yaca:phoneSpeaker")) this.enablePhoneSpeaker(player, true);
        } else {
            if (player.hasStreamSyncedMeta("yaca:phoneSpeaker")) this.enablePhoneSpeaker(player, false);
            player.voiceSettings.inCallWith.delete(target.id);
            target.voiceSettings.inCallWith.delete(player.id);
            this.muteOnPhone(player, false, true);
            this.muteOnPhone(target, false, true);
        }
    }

    /**
     * Apply the old effect to a player during a call.
     *
     * @param {alt.Player} player - The player to apply the old effect to.
     * @param {alt.Player} target - The player on the other end of the call.
     * @param {boolean} state - The state of the call.
     */
    callPlayerOldEffect(player, target, state) {
        if (!player?.valid || !target?.valid) return;

        alt.emitClientRaw(target, "client:yaca:phoneOld", player.id, state);
        alt.emitClientRaw(player, "client:yaca:phoneOld", target.id, state);

        if (state) {            
            player.voiceSettings.inCallWith.add(target.id);
            target.voiceSettings.inCallWith.add(player.id);
            if (player.hasStreamSyncedMeta("yaca:phoneSpeaker")) this.enablePhoneSpeaker(player, true);
        } else {            
            if (player.hasStreamSyncedMeta("yaca:phoneSpeaker")) this.enablePhoneSpeaker(player, false);
            player.voiceSettings.inCallWith.delete(target.id);
            target.voiceSettings.inCallWith.delete(player.id);
            this.muteOnPhone(player, false, true);
            this.muteOnPhone(target, false, true);
        }
    }

    /**
     * Mute a player during a phone call.
     *
     * @param {alt.Player} player - The player to mute.
     * @param {boolean} state - The mute state.
     * @param {boolean} [onCallStop=false] - Whether the call has stopped. Defaults to false if not provided.
     */
    muteOnPhone(player, state, onCallStop = false) {
        if (!player?.valid) return;

        player.voiceSettings.mutedOnPhone = state;
        alt.emitAllClientsRaw("client:yaca:phoneMute", player.id, state, onCallStop);
    }

    /**
     * Enable or disable the phone speaker for a player.
     *
     * @param {alt.Player} player - The player to enable or disable the phone speaker for.
     * @param {boolean} state - The state of the phone speaker.
     */
    enablePhoneSpeaker(player, state) {
        if (!player?.valid) return;

        if (state) {
            player.setStreamSyncedMeta("yaca:phoneSpeaker", Array.from(player.voiceSettings.inCallWith));
        } else {
            player.deleteStreamSyncedMeta("yaca:phoneSpeaker");
        }
    }
}
