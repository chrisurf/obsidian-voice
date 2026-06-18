# Voice Plugin — Troubleshooting & Advanced Setup

This page collects everything you only need _occasionally_: fixing errors, reading status messages, and the more advanced provider setup (like creating a dedicated AWS user). For everyday setup, see the [README](./README.md).

## Table of Contents

- [Quick Fixes](#quick-fixes)
- [Understanding Status & Error Messages](#understanding-status--error-messages)
- [Common Problems](#common-problems)
- [Advanced: AWS Polly Setup](#advanced-aws-polly-setup)
- [Advanced: Picking the Right AWS Region](#advanced-picking-the-right-aws-region)
- [Provider-Specific Notes](#provider-specific-notes)
- [How Caching Works](#how-caching-works)

## Quick Fixes

Most issues are solved by one of these:

1. **Restart Obsidian.** This clears temporary glitches after installing or updating the plugin.
2. **Re-test your credentials.** Open **Settings → Voice**, scroll to your provider, and press **Test Credentials**. A green confirmation means you're connected.
3. **Check your internet connection.** All speech is generated online by your chosen provider.
4. **Make sure a note is open.** The plugin reads the note in the active pane.

## Understanding Status & Error Messages

While the plugin works, it shows its state in the **status bar** (desktop) or the **mobile control bar**:

- A **progress bar** fills up while your note is being turned into speech.
- The **play button** spins with a refresh icon during synthesis, then switches to a pause icon once playback is ready.

If something goes wrong, the control bar briefly turns **red** and a notice appears at the top of Obsidian (for example, after a network drop or an invalid key).

![error status](./assets/error-status.png)

Everything resets automatically after a few seconds, so you can simply press play again to retry.

## Common Problems

| Symptom                                | Likely cause                                               | Fix                                                                           |
| -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nothing happens when I press play      | No note open, or playback hasn't finished synthesizing yet | Open a note; wait for the progress bar to finish                              |
| The control bar turns red              | Network issue or rejected credentials                      | Check your connection, then re-run **Test Credentials**                       |
| "Test Credentials" fails               | Wrong key, wrong region, or the TTS API isn't enabled      | Re-copy the key; confirm the region; enable the provider's Text-to-Speech API |
| No voices in the dropdown              | Credentials not yet validated                              | Enter credentials and press **Test Credentials**                              |
| Audio sounds robotic or wrong language | A voice from another language is selected                  | Pick a voice that matches your note's language                                |
| Google Cloud key rejected on desktop   | An HTTP-referrer restriction is set on the key             | Remove the referrer restriction (see below)                                   |
| Acronyms are spelled out unexpectedly  | **Spell Out Acronyms** is on (AWS Polly)                   | Turn it off in settings                                                       |

## Advanced: AWS Polly Setup

> **No AWS account yet?** Create one free at [aws.amazon.com](https://aws.amazon.com/). The AWS Free Tier includes 1 million neural characters per month for the first 12 months.

For security, create a dedicated AWS Identity and Access Management (IAM) user so the plugin can call Polly without exposing your primary credentials.

1. Sign in to the AWS Management Console and open **IAM**.
2. Choose **Users → Add users** and set a name such as `obsidian-voice-plugin`.
3. Select **Access key - Programmatic access**.
4. Grant permissions using one of the options below.

   **Option A — Fastest Setup (Recommended):** Choose **Attach existing policies directly** and select **AmazonPollyReadOnlyAccess**.

   **Option B — Minimal Permissions:** Click **Create policy → JSON**, paste the policy below, save it as `ObsidianVoiceMinimalAccess`, then attach it to the user.

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["polly:SynthesizeSpeech", "polly:DescribeVoices"],
         "Resource": "*"
       }
     ]
   }
   ```

5. Complete the user creation, then copy the **Access Key ID** and **Secret Access Key** once they appear.
6. In **Settings → Voice**, choose **AWS Polly**, select your region, paste both keys, and press **Test Credentials**.

If you ever rotate keys, just update the credentials in settings — no reinstall required.

## Advanced: Picking the Right AWS Region

Choose the AWS region closest to you for lower latency. You can change it anytime in **Settings → Voice**.

![AWS regions](./assets/aws-regions.png)

## Provider-Specific Notes

### Google Cloud

- Restrict your API key to the **Cloud Text-to-Speech API** only.
- Do **not** add an HTTP-referrer restriction — that blocks desktop apps. An unrestricted-application key also works.
- Make sure billing is active and the **Cloud Text-to-Speech API** is enabled.

### Azure Speech

- The **Region** in the plugin must match the region of your Speech resource (e.g. `eastus`, `westeurope`).
- Copy the key from your Speech resource → **Keys and Endpoint**.

### ElevenLabs

- Pick a model that fits your needs: **Multilingual v2** for quality, **Flash v2.5** for speed, or **Turbo v2.5** for a balance.
- Create your key under **Settings → API Keys** in the ElevenLabs dashboard.

## How Caching Works

After a note is synthesized, the audio is cached for that note. Replaying it costs nothing and is instant — until the note's content changes, at which point the plugin generates fresh audio. This keeps your provider usage (and bill) low.

The **download** button only appears once cached audio exists for the current note.
