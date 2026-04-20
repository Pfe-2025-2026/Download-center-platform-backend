import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class PackageVersion {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  packageId: string;

  @Column()
  version: string;

  @Column()
  architecture: string;

  @Column({ default: "stable" })
  status: "stable" | "beta" | "deprecated";

  @Column({ nullable: true })
  size: string;

  @Column({ nullable: true })
  checksum: string;

  @Column({ type: "datetime" })
  releaseDate: Date;

  @Column({ default: false })
  isRollbackTarget: boolean;

  @Column({ nullable: true })
  filePath: string;

  @Column({ nullable: true })
  originalFilename: string;
}
