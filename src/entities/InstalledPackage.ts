import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class InstalledPackage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  clientId: string;

  @Column()
  packageId: string;

  @Column()
  packageName: string;

  @Column()
  version: string;

  @Column({ type: "datetime" })
  installedAt: Date;
}
