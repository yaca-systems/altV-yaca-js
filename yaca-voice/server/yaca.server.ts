import * as alt from 'alt-server';

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
            maxVoiceRangeInMeter: number,
            muted: boolean,
            ingameName: string,
        };

        voiceplugin: {
            cid: number,
            muted: boolean,
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

const settings = {
    // Max Radio Channels
    maxRadioChannels: 9, // needs to be sync with serverside setting

    // Unique Teamspeakserver ID
    UNIQUE_SERVER_ID: "",

    // Ingame Voice Channel ID
    CHANNEL_ID: 0,

    // Ingame Voice Channel Password
    CHANNEL_PASSWORD: "",

    // Default Teamspeak Channel, if player can't be moved back to his old channel
    DEFAULT_CHANNEL_ID: 1
}

function generateRandomString(length: number = 50, possible: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
    let text = "";
    for (let i = 0; i < length; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

export class YaCAServerModule {
    static instance: YaCAServerModule;
    static nameSet = new Set();
    static voiceRangesColShapes = new Map();

    static radioFrequencyMap = new Map();

    constructor() {
        alt.log('~g~ --> YaCA: Server loaded');
        this.registerEvents();

        // Example colshape for extendet voicerange
        const pos = new alt.Vector3(0, 0, 70);
        const colshape = new alt.ColshapeCylinder(pos.x, pos.y, pos.z, 10, 5);
        colshape.playersOnly = true;
        colshape.dimension = 0;
        colshape.voiceRangeInfos = {
            maxRange: 8 // Value from clientside voiceRangesEnum
        }
        YaCAServerModule.voiceRangesColShapes.set(1337, colshape)
    }

    /***
     * Gets the singleton of YaCAServerModule.
     */
    static getInstance(): YaCAServerModule {
        if (!this.instance) {
            this.instance = new YaCAServerModule();
        }

        return this.instance;
    }

    /**
     * Generate a random name on and insert it into the database.
     */
    generateRandomName(player: alt.Player) {
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
     */
    connectToVoice(player: alt.Player) {
        if (!player?.valid) return;

        const name = this.generateRandomName(player);
        if (!name) return;

        player.voiceSettings = {
            voiceRange: 3,
            voiceFirstConnect: false,
            maxVoiceRangeInMeter: 15,
            muted: false,
            ingameName: name,
        };

        player.radioSettings = {
            activated: false as boolean,
            currentChannel: 1 as number,
            hasLong: false as boolean,
            frequencies: {} as { [key: number]: string }
        };

        this.connect(player);
    }

    registerEvents() {
        // alt:V Events
        alt.on("playerDisconnect", this.handlePlayerDisconnect.bind(this));
        alt.on("playerLeftVehicle", this.handlePlayerLeftVehicle.bind(this));
        alt.on("entityEnterColshape", this.handleEntityEnterColshape.bind(this));
        alt.on("entityLeaveColshape", this.handleEntityLeaveColshape.bind(this));

        // YaCA: voice range toggle
        alt.onClient("server:yaca:changeVoiceRange", this.changeVoiceRange.bind(this));

        // YACA: Playerlipsync
        alt.onClient("server:yaca:lipsync", (player, state, players: number[]) => {
            const playersToSend = alt.Player.all.filter(p => p.valid && players.includes(p.id));
            if (playersToSend.length) alt.emitClientUnreliable(playersToSend, "client:yaca:lipsync", player.id, state);
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
        alt.onClient("server:yaca:radioTalking", (player, state) => {
            this.radioTalkingState(player, state)
        });

        //YaCA-Radio: Change active radio channel
        alt.onClient("server:yaca:changeActiveRadioChannel", (player, channel) => {
            this.radioActiveChannelChange(player, channel)
        });
    }

    /**
     * Handle various cases if player disconnects.
     */
    handlePlayerDisconnect(player: alt.Player) {
        const playerID = player.id;
        YaCAServerModule.nameSet.delete(player.voiceSettings?.ingameName);

        const allFrequences = YaCAServerModule.radioFrequencyMap;
        for (const [key, value] of allFrequences) {
            value.delete(playerID);
            if (!value.size) YaCAServerModule.radioFrequencyMap.delete(key)
        }
    }

    /**
     * Handle various cases if player left a vehicle.
     */
    handlePlayerLeftVehicle(player: alt.Player, vehicle: alt.Vehicle, seat: number) {
        YaCAServerModule.changeMegaphoneState(player, false, true);
    }

    /**
     * Handle various cases if player enteres colshapes.
     */
    handleEntityEnterColshape(colshape: alt.Colshape, entity: alt.Entity) {
        if (!colshape.voiceRangeInfos || !(entity instanceof alt.Player) || !entity?.valid) return;

        const voiceRangeInfos = colshape.voiceRangeInfos;

        entity.emitRaw("client:yaca:setMaxVoiceRange", voiceRangeInfos.maxRange);

        switch (voiceRangeInfos.maxRange)
        {
            case 5:
                entity.voiceSettings.maxVoiceRangeInMeter = 20;
                break;
            case 6:
                entity.voiceSettings.maxVoiceRangeInMeter = 25;
                break;
            case 7:
                entity.voiceSettings.maxVoiceRangeInMeter = 30;
                break;
            case 8:
                entity.voiceSettings.maxVoiceRangeInMeter = 40;
                break;
        }
    };

    /**
     * Handle various cases if player leaves colshapes.
     */
    handleEntityLeaveColshape(colshape: alt.Colshape, entity: alt.Entity) {
        if (!colshape.voiceRangeInfos || !(entity instanceof alt.Player) || !entity?.valid) return;

        entity.voiceSettings.maxVoiceRangeInMeter = 15;

        //We have to reset it here if player leaves the colshape
        if (entity.voiceSettings.voiceRange > 15) {
            entity.emitRaw("client:yaca:setMaxVoiceRange", 15);
            this.changeVoiceRange(entity, 15);
        }
    };

    /**
     * Syncs player alive status and mute him if he is dead or what ever.
     */
    static changePlayerAliveStatus(player: alt.Player, alive: boolean) {
        if (!player.states.isAlive && alive) return;

        player.voiceSettings.muted = !alive;
        alt.emitAllClientsRaw("client:yaca:muteTarget", player.id, !alive);

        if (player.voiceplugin) player.voiceplugin.muted = !alive;
    }

    /**
     * Apply the megaphone effect on a specific player via client event.
     */
    playerUseMegaphone(player: alt.Player, state: boolean) {
        if (!player.vehicle && !player.hasLocalMeta("canUseMegaphone")) return;
        if (player.vehicle && (!player.vehicle.valid || [1, 2].indexOf(player.seat) == -1)) return;
        if ((!state && !player?.hasStreamSyncedMeta("yaca:megaphoneactive")) || (state && player?.hasStreamSyncedMeta("yaca:megaphoneactive"))) return;

        YaCAServerModule.changeMegaphoneState(player, state);
    }

    /**
     * Apply the megaphone effect on a specific player.
     */
    static changeMegaphoneState(player: alt.Player, state: boolean, forced: boolean = false) {
        if (!state && player.hasStreamSyncedMeta("yaca:megaphoneactive")) {
            player.deleteStreamSyncedMeta("yaca:megaphoneactive");
            if (forced) player.setLocalMeta("lastMegaphoneState", false);
        } else if (state && !player.hasStreamSyncedMeta("yaca:megaphoneactive")) {
            player.setStreamSyncedMeta("yaca:megaphoneactive", 30);
        }
    }

    /**
     * Kick player if he doesnt have the voice plugin activated.
     */
    playerNoVoicePlugin(player: alt.Player) {
        if (player?.valid) player.kick("Dein Voiceplugin war nicht aktiviert!");
    }

    /**
     * Used if a player reconnects to the server.
     */
    playerReconnect(player: alt.Player, isFirstConnect: boolean) {
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
     */
    changeVoiceRange(player: alt.Player, range: number) {
        // Sanitycheck to prevent hackers or shit
        if (player.voiceSettings.maxVoiceRangeInMeter < range) return player.emitRaw("client:yaca:setMaxVoiceRange", 15);

        player.voiceSettings.voiceRange = range;
        alt.emitAllClientsRaw("client:yaca:changeVoiceRange", player.id, player.voiceSettings.voiceRange);

        if (player.voiceplugin) player.voiceplugin.range = range;
    }

    /**
     * sends initial data needed to connect to teamspeak plugin.
     */
    connect(player: alt.Player) {
        player.voiceSettings.voiceFirstConnect = true;

        player.emitRaw("client:yaca:init", {
            suid: settings.UNIQUE_SERVER_ID,
            chid: settings.CHANNEL_ID,
            deChid: settings.DEFAULT_CHANNEL_ID,
            channelPassword: settings.CHANNEL_PASSWORD,
            ingameName: player.voiceSettings.ingameName,
        });
    }

    /**
     * Add new player to all other players on connect or reconnect, so they know about some variables.
     */
    addNewPlayer(player: alt.Player, cid: number) {
        if (!player?.valid || !cid) return;

        player.voiceplugin = {
            cid: cid,
            muted: player.voiceSettings.muted,
            range: player.voiceSettings.voiceRange,
            playerId: player.id
        };

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
    static isLongRadioPermitted(player: alt.Player) {
        player.radioSettings.hasLong = true //Add some checks if you want shortrange system;
    }

    enableRadio(player: alt.Player, state: boolean) {
        if (!player?.valid) return;

        player.radioSettings.activated = state;
        YaCAServerModule.isLongRadioPermitted(player);

        player.setStreamSyncedMeta('yaca:radioEnabled', state);
    }

    changeRadioFrequency(player: alt.Player, channel: number, frequency: string) {
        if (!player?.valid) return;
        if (!player.radioSettings.activated) return player.sendMessage("Das Funkgerät ist aus!");
        if (isNaN(channel) || channel < 1 || channel > settings.maxRadioChannels) return player.sendMessage("Fehlerhafter Funk Kanal!");

        // Leave radiochannel if frequency is 0
        if (frequency == "0") return YaCAServerModule.getInstance().leaveRadioFrequency(player, channel, frequency);

        // Add player to channel map, so we know who is in which channel
        if (!YaCAServerModule.radioFrequencyMap.has(frequency)) YaCAServerModule.radioFrequencyMap.set(frequency, new Map());
        YaCAServerModule.radioFrequencyMap.get(frequency).set(player.id, { muted: false });

        player.radioSettings.frequencies[channel] = frequency;

        player.emitRaw("client:yaca:setRadioFreq", channel, frequency)

        //TODO: Add radio effect to player in new frequency
        // const newPlayers = this.getPlayersInRadioFrequency(frequency);
        // if (newPlayers.length) alt.emitClientRaw(newPlayers, "client:yaca:setRadioEffectInFrequency", frequency, player.id);
    }

    leaveRadioFrequency(player: alt.Player, channel: number, frequency: string) {
        if (!player?.valid) return;

        frequency = frequency == "0" ? player.radioSettings.frequencies[channel] : frequency;

        if (!YaCAServerModule.radioFrequencyMap.has(frequency)) return;

        YaCAServerModule.radioFrequencyMap.get(frequency).delete(player.id);

        player.radioSettings.frequencies[channel] = "0";

        player.emitRaw("client:yaca:setRadioFreq", channel, 0)

        if (!YaCAServerModule.radioFrequencyMap.get(frequency).size) YaCAServerModule.radioFrequencyMap.delete(frequency)
    }

    radioChannelMute(player: alt.Player, channel: number) {
        if (!player?.valid) return;

        const radioFrequency = player.radioSettings.frequencies[channel];
        const foundPlayer = YaCAServerModule.radioFrequencyMap.get(radioFrequency)?.get(player.id);
        if (!foundPlayer) return;

        foundPlayer.muted = !foundPlayer.muted;
        player.emitRaw("client:yaca:setRadioMuteState", channel, foundPlayer.muted)
    }

    radioActiveChannelChange(player: alt.Player, channel: number) {
        if (!player?.valid || isNaN(channel) || channel < 1 || channel > settings.maxRadioChannels) return;

        player.radioSettings.currentChannel = channel;
    }

    radioTalkingState(player: alt.Player, state: boolean) {
        if (!player?.valid) return;
        if (!player.radioSettings.activated) return;

        const radioFrequency = player.radioSettings.frequencies[player.radioSettings.currentChannel];
        if (!radioFrequency) return;

        const playerID = player.id;

        const getPlayers = YaCAServerModule.radioFrequencyMap.get(radioFrequency);
        let targets: alt.Player[] = [];
        let radioInfos = {} as { [key: number]: { shortRange: boolean }};
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
            }
        }

        if (targets.length) alt.emitClientRaw(targets, "client:yaca:radioTalking", player.id, radioFrequency, state, radioInfos);
    };

    /* ======================== PHONE SYSTEM ======================== */
    callPlayer(player: alt.Player, target: alt.Player, state: boolean) {
        if (!player?.valid || !target?.valid) return;

        alt.emitClientRaw(target, "client:yaca:phone", player.id, state);
        alt.emitClientRaw(player, "client:yaca:phone", target.id, state);
    }

    // Old phone effect, for something like redm should it be good
    callPlayerOldEffect(player: alt.Player, target: alt.Player, state: boolean) {
        if (!player?.valid || !target?.valid) return;

        alt.emitClientRaw(target, "client:yaca:phoneOld", player.id, state);
        alt.emitClientRaw(player, "client:yaca:phoneOld", target.id, state);
    }

    muteOnPhone(player: alt.Player, state: boolean) {
        if (!player?.valid) return;

        if (state) {
            player.setSyncedMeta("yaca:isMutedOnPhone", state);
        } else {
            player.deleteSyncedMeta("yaca:isMutedOnPhone");
        }
    }

    enablePhoneSpeaker(player: alt.Player, state: boolean, phoneCallMemberIds: number[]) {
        if (!player?.valid) return;

        if (state) {
            player.setSyncedMeta("yaca:phoneSpeaker", phoneCallMemberIds);
        } else {
            player.deleteSyncedMeta("yaca:phoneSpeaker");
        }
    }
}
