import * as alt from 'alt-client';

import { YaCAClientModule } from './yaca.client.js';

alt.on("connectionComplete", () => {
    YaCAClientModule.getInstance();
});
