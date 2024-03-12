/* eslint-disable */
import * as cdk from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-codecommit'
import { BuildSpec, EventAction, FilterGroup, GitHubSourceCredentials, LinuxBuildImage, PipelineProject, Project, Source } from 'aws-cdk-lib/aws-codebuild'
import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { CodeBuildStep, CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines'
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Deployment } from './stages';
import { CodeBuildAction, CodeCommitSourceAction, CodeDeployEcsDeployAction, EcsDeployAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { CodeBuildProject } from 'aws-cdk-lib/aws-events-targets';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { AwsLogDriver, Cluster, ContainerImage, FargateTaskDefinition, Protocol } from 'aws-cdk-lib/aws-ecs';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';

const githubConfig = {
    owner: 'Kava-Up-LLC',
    repo: 'netcicdgittk',
    branch: 'develop'
}
export class CodePipelineStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props)
        // const inputSrc = CodePipelineSource.gitHub(
        //     "Kava-Up-LLC/netcicdgittk",
        //     "develop",
        //     {
        //         authentication:
        //             cdk.SecretValue.secretsManager("github-oauth-token"),
        //     }
        // )
        // new GitHubSourceCredentials(this, "code-build-credentials", {
        //     accessToken: cdk.SecretValue.secretsManager("github-oauth-token"),
        // })

        const source = Source.gitHub({
            owner: githubConfig.owner,
            repo: githubConfig.repo,
        })

        const buildRole = new Role(this, 'CodeBuildIamRole', {
            assumedBy: new ServicePrincipal('codebuild.amazonaws.com')
        });

        buildRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: ['cloudformation:*']
        }));

        buildRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: ['iam:*']
        }));

        buildRole.addToPolicy(new PolicyStatement({
            resources: ['*'],
            actions: ['ecr:GetAuthorizationToken']
        }));

        buildRole.addToPolicy(new PolicyStatement({
            resources: [`*`],
            actions: ['ecr:*']
        }));


        const project = new Project(this, "project", {
            projectName: "pipeline-project",
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                env: {
                    shell: 'bash'
                },
                phases: {
                    pre_build: {
                        commands: [
                            'echo logging in to AWS ECR',
                            'aws --version',
                            'echo $AWS_STACK_REGION',
                            'echo $CONTAINER_NAME',
                            'aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 306456023534.dkr.ecr.us-east-2.amazonaws.com',
                            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                            'echo $COMMIT_HASH',
                            'IMAGE_TAG=${COMMIT_HASH:=latest}',
                            'echo $IMAGE_TAG'
                        ],
                    },
                    build: {
                        commands: [
                            'echo Build started on `date`',
                            'echo Build Docker image',
                            'docker build -f ${CODEBUILD_SRC_DIR}/Dockerfile -t 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:latest .',
                            'echo Running "docker tag 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:latest 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:${IMAGE_TAG}"',
                            'docker tag 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:latest 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:${IMAGE_TAG}'
                        ],
                    },
                    post_build: {
                        commands: [
                            'echo Build completed on `date`',
                            'echo Push Docker image',
                            'docker push 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:latest',
                            'docker push 306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:${IMAGE_TAG}',
                            'printf "[{\\"name\\": \\"netecscicd\\", \\"imageUri\\": \\"306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:$IMAGE_TAG\\"}]" > imagedefinitions.json'
                        ]
                    }
                },
                artifacts: {
                    files: ['imagedefinitions.json']
                },
            }),
            environment: {
                buildImage: LinuxBuildImage.STANDARD_5_0,
                privileged: true,
            },
          role: buildRole
        })
       
        // const pipeline = new CodePipeline(this, 'Pipeline', {
        //     crossAccountKeys: true,
        //     enableKeyRotation: true,
        //     synth: new ShellStep('Synth', {
        //         input: inputSrc
        //     }),
        // })

        // const pipeline = new CodePipeline(this, 'Pipeline', {
        //     crossAccountKeys: true,
        //     enableKeyRotation: true, 
        //     synth: new ShellStep('Synth', { 
        //       input: inputSrc,
        //         installCommands: [
        //           'make warming'
        //         ],
        //         commands: ["make build"],
        //       }),
        //   })

        const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });
        const cluster = new Cluster(this, 'EcsCluster', { vpc });
    
        // create a task definition with CloudWatch Logs
        const logging = new AwsLogDriver({
          streamPrefix: "myapp",
        })
    
    
        const ecsFargateServiceRole = new Role(this, 'FargateTaskExecutionServiceRole', {
          assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com')
        });
        
        // Add a policy to a Role
        ecsFargateServiceRole.addToPolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            resources: ['*'],
            actions: [            
              'ecr:GetAuthorizationToken',
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
              'logs:CreateLogStream',
              'logs:PutLogEvents'
            ]
          })
        );
    
        const taskDef = new FargateTaskDefinition(this, "MyTaskDefinition", {
          memoryLimitMiB: 512,
          cpu: 256,
          executionRole:ecsFargateServiceRole,
          taskRole:ecsFargateServiceRole
        })
        
        const container = taskDef.addContainer('netecscicd', {
          image: ContainerImage.fromRegistry('306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:latest'),
          memoryLimitMiB: 256,
          
        });
    
        container.addPortMappings({
          containerPort: 8080,
          hostPort: 8080,
          protocol: Protocol.TCP,
        });
    
        
    
        // Instantiate Fargate Service with just cluster and image
        const finalsvc = new ApplicationLoadBalancedFargateService(this, 'AlbFargateService', {
          // The task definition will mostlikely be bigger as you need to pass props
          // taskImageOptions: {
          //   image: ecs.ContainerImage.fromRegistry('306456023534.dkr.ecr.us-east-2.amazonaws.com/appambitwebpoc:638454242385650280'),
          // },
          // publicLoadBalancer: true,
          // cpu: 512, // <-- Default: 0.25 Otherwise container dies to quickly
          // memoryLimitMiB: 1024// <-- 
          taskDefinition:taskDef
        })

        const artifacts = {
            source: new Artifact("Source"),
            build: new Artifact("BuildOutput"),
        }
        const pipelineActions = {
            source: new GitHubSourceAction({
                actionName: "Github",
                
                owner: githubConfig.owner,
                repo: githubConfig.repo,
                branch: githubConfig.branch,
                oauthToken: cdk.SecretValue.secretsManager("github-oauth-token"),
                output: artifacts.source,
            }),
            build: new CodeBuildAction({
                actionName: "CodeBuild",
                project,
                input: artifacts.source,
                outputs: [artifacts.build],
            }),
            deploy: new EcsDeployAction(
                {
                    actionName:"DeployAction",
                service: finalsvc.service,
                input: artifacts.build,
                }
            )
           
        }

        const pipeline1 = new Pipeline(this, "DeployPipeline", {
            pipelineName: `appambit-poc-pipeline`,
            stages: [
                { stageName: "Source", actions: [pipelineActions.source] },
                { stageName: "Build", actions: [pipelineActions.build] },
                { stageName: "Deploy", actions: [pipelineActions.deploy] },
                
            ],
        })
        
        // const dockerBuildStep = new CodeBuildStep('BuildDockerImage', {
        //     input: inputSrc,
        //     commands: [''],
        //     partialBuildSpec: BuildSpec.fromSourceFilename('buildspec.yaml'),// this is store in the Lambda repo
        //     buildEnvironment: {
        //         buildImage: LinuxBuildImage.STANDARD_5_0
        //     },
        //     rolePolicyStatements: [
        //         new PolicyStatement({
        //             actions: [
        //                 "ecr:GetAuthorizationToken",
        //                 "ecr:BatchCheckLayerAvailability",
        //                 "ecr:GetDownloadUrlForLayer",
        //                 "ecr:GetRepositoryPolicy",
        //                 "ecr:DescribeRepositories",
        //                 "ecr:ListImages",
        //                 "ecr:DescribeImages",
        //                 "ecr:BatchGetImage",
        //                 "ecr:GetLifecyclePolicy",
        //                 "ecr:GetLifecyclePolicyPreview",
        //                 "ecr:ListTagsForResource",
        //                 "ecr:DescribeImageScanFindings",
        //                 "ecr:InitiateLayerUpload",
        //                 "ecr:UploadLayerPart",
        //                 "ecr:CompleteLayerUpload",
        //                 "ecr:PutImage"

        //             ],
        //             resources: ['*']
        //         })
        //     ]
        // })

        // const artifact = new Artifact();


        // 2. Stage : CodeBuild

        // const devStage = new Deployment(this, 'Dev')
        // pipeline.addStage(devStage, {
        //     // Execute all sequence of actions before deployment
        //     pre: [
        //         dockerBuildStep
        //     ],
        //     // Execute validation check for post-deployment
        //     post: [

        //     ]
        // })

         
    }
}