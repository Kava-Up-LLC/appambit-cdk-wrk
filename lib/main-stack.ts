/* eslint-disable */
import { CfnOutput, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import { EventBus } from 'aws-cdk-lib/aws-events'
import ec2 = require('aws-cdk-lib/aws-ec2');
import ecs = require('aws-cdk-lib/aws-ecs');
import {  Construct } from 'constructs'
import ecs_patterns = require('aws-cdk-lib/aws-ecs-patterns');
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';


export class MainStack extends Stack {
  constructor (scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });
    const cluster = new ecs.Cluster(this, 'EcsCluster', { vpc });

    // create a task definition with CloudWatch Logs
    const logging = new ecs.AwsLogDriver({
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

    const taskDef = new ecs.FargateTaskDefinition(this, "MyTaskDefinition", {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole:ecsFargateServiceRole,
      taskRole:ecsFargateServiceRole
    })
    
    const container = taskDef.addContainer('web', {
      image: ecs.ContainerImage.fromRegistry('306456023534.dkr.ecr.us-east-2.amazonaws.com/netcorecicd:ee1249db50494e568a551295077ca322'),
      memoryLimitMiB: 256,
      
    });

    container.addPortMappings({
      containerPort: 8080,
      hostPort: 8080,
      protocol: ecs.Protocol.TCP,
    });

    

    // Instantiate Fargate Service with just cluster and image
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'AlbFargateService', {
      // The task definition will mostlikely be bigger as you need to pass props
      // taskImageOptions: {
      //   image: ecs.ContainerImage.fromRegistry('306456023534.dkr.ecr.us-east-2.amazonaws.com/appambitwebpoc:638454242385650280'),
      // },
      // publicLoadBalancer: true,
      // cpu: 512, // <-- Default: 0.25 Otherwise container dies to quickly
      // memoryLimitMiB: 1024// <-- 
      taskDefinition:taskDef
    })

    // Create a sample event bus
    const eventBus = new EventBus(this, 'EventBus')

    /**
     * Example of different behavior based on the stack name.
     * Create the second event bus if it is a 'dev' deployment.
     */
    if (this.stackName.toLowerCase().includes('dev')) {
      new EventBus(this, 'EventBus2')
    }

    // Output
    new CfnOutput(this, 'EventBusName', {
      value: eventBus.eventBusName
    })
  }
}