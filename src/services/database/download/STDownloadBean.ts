import type { STBeanCoding } from "../STBeanCoding";
import type { STRecordValueType } from "@/services/STDataType";

export enum STMediaType {
    Unknown = 0,
    Video = 1,
    Image = 2,
    File = 3,
}

export enum STDownloadStatus{
    None = -1,
    Pending = 0,
    Downloading = 1,
    Transcoding = 2,
    Paused = 3,
    Saving = 4,
    Complete = 5,
    Failed = 6,
    FailedNoSpace = 7,
    FailedTranscode = 8
}

export class STDownloadBean implements STBeanCoding<STDownloadBean>{
    public uuid: string = '';
    public userId: string = '';
    public title: string;
    public icon: string;
    public qualityLabel: string;
    public host: string;
    public faviconUrl?: string;
    public websiteUrl: string;
    public mediaType: STMediaType = STMediaType.Video;
    public downloadUrl: string = '';
    public addionalDownloadUrls: string[];
    public isProtected: boolean = false;
    public componentUrl: string = '';
    public downloadProcess: number = 0;
    public status: STDownloadStatus;
    public createTime?: Date;
    public updateTime?: Date;
    public userInfo?: Record<string, STRecordValueType> = {};

    public speed?: string = '';

    constructor(){
        this.title = "";
        this.icon = "";
        this.qualityLabel = "";
        this.host = "";
        this.websiteUrl = "";
        this.addionalDownloadUrls = [];
        this.status = STDownloadStatus.None;
        this.createTime = new Date();
        this.updateTime = new Date();
        this.userInfo = {};
        this.createTime = new Date();
        this.updateTime = new Date();
        this.speed = '';
    }

    toRecord(): Record<string, STRecordValueType> {
        return {
            uuid: this.uuid,
            user_id: this.userId,
            title: this.title,
            icon: this.icon,
            quality_label: this.qualityLabel,
            host: this.host,
            website_url: this.websiteUrl,
            media_type: this.mediaType,
            download_url: this.downloadUrl,
            addional_download_urls: this.addionalDownloadUrls,
            is_protected: this.isProtected,
            component_url: this.componentUrl,
            download_process: this.downloadProcess,
            status: this.status,
            create_time: this.createTime,
            update_time: this.updateTime,
            user_info: this.userInfo,
        };
    }

    fromRecord(record: Record<string, STRecordValueType>): STDownloadBean {
        this.uuid = record["uuid"] as string;
        this.userId = record["user_id"] as string;
        this.title = record["title"] as string;
        this.icon = record["icon"] as string;
        this.qualityLabel = record["quality_label"] as string;
        this.host = record["host"] as string;
        this.websiteUrl = record["website_url"] as string;
        this.mediaType = record["media_type"] as STMediaType;
        this.downloadUrl = record["download_url"] as string;
        this.addionalDownloadUrls = record["addional_download_urls"] as string[];
        this.isProtected = record["is_protected"] as boolean;
        this.componentUrl = record["component_url"] as string;
        this.downloadProcess = record["download_process"] as number;
        this.status = record["status"] as STDownloadStatus;
        this.createTime = new Date(record["create_time"] as number);
        this.updateTime = new Date(record["update_time"] as number);
        this.userInfo = record["user_info"] as Record<string, STRecordValueType>;
        return this;
    }
}