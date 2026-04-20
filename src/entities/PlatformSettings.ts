import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class PlatformSettings {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ default: "Download Center" })
  platformName: string;

  @Column({ default: "" })
  logoUrl: string;

  @Column({ default: true })
  emailAlertsEnabled: boolean;

  @Column({ default: "" })
  alertEmail: string;
}
