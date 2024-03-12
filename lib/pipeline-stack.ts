/* eslint-disable */
import * as cdk from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-codecommit'
import { BuildSpec } from 'aws-cdk-lib/aws-codebuild'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines'
import { CfnOutput, Stack,  StackProps } from 'aws-cdk-lib'
import {  Construct } from 'constructs'

export class CodePipelineStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const pipeline = new CodePipeline(this, 'Pipeline', {
      crossAccountKeys: true,
      enableKeyRotation: true, 
      synth: new ShellStep('Synth', { 
        input: CodePipelineSource.gitHub(
            "Kava-Up-LLC/netcicdgittk",
            "develop",
            {
              authentication:
                cdk.SecretValue.secretsManager("github-oauth-token"),
            }
          ),
          installCommands: [
            'make warming'
          ],
          commands: ["make build"],
        }),
    })

  }
}