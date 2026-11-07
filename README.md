# City Trading Unit

A phone stand-in for the electronic trading unit from a 2009 city-building board game, made for when the original stops working. It is fan-made and not affiliated with Hasbro.

- **Build:** press the skyline button on the side. The light ring spins and lands on 1, 2 or 3 blocks, or a station. Odds can be changed in Settings.
- **Auction:** press the handshake button. It runs a 50-second timer; in the last 5 seconds a warning plays and the red light speeds up, then a gavel sounds. A bid tracker logs the top bid and bidder.
- **Deal timer:** the same timer, used for trades between players.
- **Narrator:** a jolly old tycoon calls the bids, the warning, "going once, going twice", the winner, turns and build results, in short lines with several variants each.
- **New game:** players type their name and record themselves saying it. The narrator does a roll call and uses each player's own recording in announcements.
- **Music:** a shuffled, looping playlist of public-domain ragtime that gets quieter during auctions and while the narrator talks.
- **Players' phones:** everyone scans the QR code in New game to join. In auctions they type secret bids, and the main phone reveals the winner with every bid listed. The active player's phone shows YOUR TURN, with Build and End-turn buttons.
- **Voice bids** (Safari tab only, when no phones have joined): say a name or colour plus an amount, like "Alex sixty" or "Blue, one fifty".

## Install on iPhone
1. Open the site in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the new icon. It runs full-screen, and everything except music works offline after the first launch.

Voice bids only work in a normal Safari tab, because iPhone blocks speech recognition in Home Screen apps.

## Credits
- **Narrator voice:** generated with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0), voice `am_santa`, using [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx). Lines are in `tools/narration_script.py` and are rebuilt with `tools/make_narration.py`.
- **Music:** recordings from Wikimedia Commons, all public domain or Creative Commons. Every track's title, licence and source page are in `music/playlist.json`, and they're listed in the app under Settings › Music › Track credits.
- **Sound effects:** synthesized in the browser, with no audio files.
- **Phone link:** [PeerJS](https://peerjs.com) (MIT) over WebRTC, using the free PeerJS signalling server; QR codes by [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT).
