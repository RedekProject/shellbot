import {RichEmbed, TextChannel} from "discord.js";
import * as TwitterApi from "twitter";
import {Twitter as TwitterVO} from "../Entity/Twitter";
import {TwitterRepository} from "../Repository/TwitterRepository";
import {AbstractSchedule} from "./AbstractSchedule";

enum TwitterSearchType {
    Account = "account",
    Tweet = "tweets",
}

export class Twitter extends AbstractSchedule {
    public static NAME: string = "twitter";
    private _twitterApi: TwitterApi;
    private readonly _queryType: string;
    private readonly _queryValues: string[];
    private readonly _restrictionAllow: string[]|null = null;
    private readonly _restrictionDeny: string[]|null = null;

    public constructor(args: any) {
        super();
        this.name = Twitter.NAME;
        const restrictions = args.query.restrictions;
        if (args.api_key && args.api_secret_key && args.access_token && args.access_token_secret) {
            this._twitterApi = new TwitterApi({
                consumer_key: args.api_key ,
                consumer_secret: args.api_secret_key,
                access_token_key: args.access_token,
                access_token_secret: args.access_token_secret,
            });
            if (args.query.type !== undefined && args.query.type !== null && args.query.values.length > 0) {
                this._queryType = args.query.type;
                this._queryValues = args.query.values;
            } else {
                this.error("TwitterSchedule config parameters are not correct, please RTFM.");
            }
            if (restrictions) {
               if (restrictions.allow && Array.isArray(restrictions.allow)) {
                    this._restrictionAllow = restrictions.allow;
               }
               if (restrictions.deny && Array.isArray(restrictions.deny)) {
                    this._restrictionDeny = restrictions.deny;
                }
            }
        } else {
            this.error("There is one or more api_key missing with TwitterAPI, please RTFM.");
        }
    }

    public do(channel: TextChannel) {
        switch (this._queryType) {
            case TwitterSearchType.Account:
                this.lastTweets(channel);
                break;
            case TwitterSearchType.Tweet:

                break;
        }
    }

    public async lastTweets(channel: TextChannel, max: number = 10) {
        const twitterRepository = this.database.manager.getCustomRepository(TwitterRepository);
        for (const screenName of this._queryValues) {
            const lastTweetId = await twitterRepository.getLastTweetId(screenName, channel.name);
            const params: any = {
                screen_name: screenName,
                count: max,
            };
            if (lastTweetId !== null && lastTweetId !== undefined) {
                params.since_id = lastTweetId;
            }
            this._twitterApi.get("statuses/user_timeline", params, async (error, response) => {
                if (!error && response) {
                    const tweets = response.reverse();
                    this.info(`${tweets.length} fetched`);
                    for (const tweet of tweets) {
                        const twitterVO = new TwitterVO();
                        twitterVO.twitterId = tweet.id_str;
                        twitterVO.channel = channel.name;
                        twitterVO.username = screenName;
                        if (this.filter(true, tweet.text) && this.filter(false, tweet.text) && !tweet.in_reply_to_status_id && !tweet.in_reply_to_user_id) {
                            const tweetExists = await twitterRepository.isTweetExists(twitterVO.twitterId, twitterVO.channel);
                            if (tweetExists != null) {
                                this.info(`Tweet ${tweet.id_str} already exists in database.`);
                                continue;
                            }
                            const tweetEmbed = Twitter.renderEmbed(tweet);
                            channel.send(tweetEmbed).then(() => {
                                this.database.manager.save(twitterVO).then(() => {
                                    this.info(`Tweet ${tweet.id_str} added in database.`);
                                });
                            }).catch((reason) => {
                                this.error(`Cannot fetch or send tweet: ${reason}`);
                            });
                        }
                    }
                } else {
                    this.error(error);
                }
            });
        }
    }

    public filter(isAllowed: boolean, tweet: string) {
        const restrictions: string[]|null = isAllowed ? this._restrictionAllow : this._restrictionDeny;
        if (restrictions) {
            for (const word of restrictions) {
                if (isAllowed) {
                    if (tweet.match(new RegExp(word, "ig"))) {
                        return true;
                    }
                } else {
                    if (!tweet.match(new RegExp(word, "ig"))) {
                        return true;
                    }
                }

            }
        } else {
            return true;
        }

        return false;
    }

    protected static renderEmbed(tweet: any) {
        const tweetUrl = `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`;
        const tweetEmbed = new RichEmbed();
        tweetEmbed.setAuthor(tweet.user.name, tweet.user.profile_image_url, tweetUrl);
        tweetEmbed.setColor(3447003);
        tweetEmbed.setDescription(tweet.text);
        tweetEmbed.setFooter(`${tweet.favorite_count} ❤️ ${tweet.retweet_count} 🔁`);
        tweetEmbed.setTimestamp(tweet.created_at);

        return tweetEmbed;
    }
}
