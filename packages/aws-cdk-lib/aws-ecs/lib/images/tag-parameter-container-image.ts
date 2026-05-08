import type { Construct } from 'constructs';
import type * as ecr from '../../../aws-ecr';
import * as cdk from '../../../core';
import { lit } from '../../../core/lib/private/literal-string';
import type { ContainerDefinition } from '../container-definition';
import type { ContainerImageConfig } from '../container-image';
import { ContainerImage } from '../container-image';

/**
 * A special type of `ContainerImage` that uses an ECR repository for the image,
 * but a CloudFormation Parameter for the tag or digest of the image in that repository.
 * This allows providing this tag or digest through the Parameter at deploy time,
 * for example in a CodePipeline that pushes a new tag of the image to the repository during a build step,
 * and then provides that new tag through the CloudFormation Parameter in the deploy step.
 *
 * @see #tagParameterName
 */
export class TagParameterContainerImage extends ContainerImage {
  private readonly repository: ecr.IRepository;
  private imageTagParameter?: cdk.CfnParameter;

  public constructor(repository: ecr.IRepository) {
    super();
    this.repository = repository;
  }

  public bind(scope: Construct, containerDefinition: ContainerDefinition): ContainerImageConfig {
    this.repository.grantPull(containerDefinition.taskDefinition.obtainExecutionRole());
    const imageTagParameter = new cdk.CfnParameter(scope, 'ImageTagParam');
    this.imageTagParameter = imageTagParameter;

    const tagOrDigest = imageTagParameter.valueAsString;
    const baseUri = this.repository.repositoryUriForTag();

    // Deploy-time condition: detect whether the parameter value is a digest (starts with "sha256:")
    // Fn::Split("sha256:", value) → if value starts with "sha256:", first element is ""
    // Fn::Equals(first_element, "") → true → digest → use "@" separator
    const isDigest = new cdk.CfnCondition(scope, 'ImageDigestCondition', {
      expression: cdk.Fn.conditionEquals(
        cdk.Fn.select(0, cdk.Fn.split('sha256:', tagOrDigest)),
        '',
      ),
    });

    const imageName = cdk.Fn.conditionIf(
      isDigest.logicalId,
      `${baseUri}@${tagOrDigest}`,
      `${baseUri}:${tagOrDigest}`,
    ).toString();

    return { imageName };
  }

  /**
   * Returns the name of the CloudFormation Parameter that represents the tag
   * or digest of the image in the ECR repository.
   */
  public get tagParameterName(): string {
    return cdk.Lazy.string({
      produce: () => {
        if (this.imageTagParameter) {
          return this.imageTagParameter.logicalId;
        } else {
          throw new cdk.UnscopedValidationError(lit`TagParameterNotBound`, 'TagParameterContainerImage must be used in a container definition when using tagParameterName');
        }
      },
    });
  }

  /**
   * Returns the value of the CloudFormation Parameter that represents the tag
   * or digest of the image in the ECR repository.
   */
  public get tagParameterValue(): string {
    return cdk.Lazy.string({
      produce: () => {
        if (this.imageTagParameter) {
          return this.imageTagParameter.valueAsString;
        } else {
          throw new cdk.UnscopedValidationError(lit`TagParameterNotBound`, 'TagParameterContainerImage must be used in a container definition when using tagParameterValue');
        }
      },
    });
  }
}
