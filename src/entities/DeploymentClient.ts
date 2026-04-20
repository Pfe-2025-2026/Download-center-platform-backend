import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity()
export class DeploymentClient {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  deploymentId: string;

  @Column()
  clientId: string;

  @Column()
  clientHostname: string;

  @Column({ default: "pending" })
  status: "pending" | "downloading" | "installing" | "success" | "failed";

  @Column({ type: "real", nullable: true })
  duration: number | null;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ type: "datetime", nullable: true })
  startedAt: Date | null;

  @Column({ type: "datetime", nullable: true })
  completedAt: Date | null;
}
