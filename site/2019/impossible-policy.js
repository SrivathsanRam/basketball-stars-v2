(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const vx=p=>Number(p.body?.velocity?.x)||0;
  const vy=p=>Number(p.body?.velocity?.y)||0;
  const move=(p,x,t=5)=>Math.abs(x-p.getX())<t?2:Math.sign(x-p.getX());
  const note=(c,k)=>{if(c.__decisionStats)c.__decisionStats[k]=(c.__decisionStats[k]||0)+1;};
  function activeBlockRisk(c){
    const p=c.player,o=c.opponent,shape=o.isBlockedOrPump?o.blockBody:o.block;
    if(!shape||!o.body?.shapes?.has(shape))return false;
    const center=shape.worldCOM,bounds=shape.bounds;
    const origin=p.getX()-c.SIDE*35,front=(origin-center.x)*c.SIDE;
    if(front<-8||front>150)return false;
    const time=clamp(front/500,0,.25);
    const ballY=p.getY()-50-360*time+365*time*time;
    const handY=center.y+vy(o)*time+547*time*time;
    const half=(Number(bounds?.height)||45)/2+14;
    return Math.abs(ballY-handY)<half;
  }
  function protectDefensiveActions(c,dt){
    const p=c.player,o=c.opponent;
    if(p.withBall||!o.withBall)return;
    c.currentBlockOrPump=false;
    const gap=Math.abs(p.getX()-o.getX()),distance=o.SIDE===1?o.getX():800-o.getX();
    const st=c.__safeDefense||(c.__safeDefense={cooldown:0});
    st.cooldown=Math.max(0,st.cooldown-dt);
    if(o.isGrounded){
      const exposed=distance<460||Math.abs(vx(o))>95;
      c.currentAction=Boolean(p.isGrounded&&p.canAct&&gap<46&&exposed&&st.cooldown===0);
      if(c.currentAction){st.cooldown=.8;c.currentDash=0;}
      // A short closeout dash locks out the jump needed for a quick three.
      if(distance>=460&&gap<260)c.currentDash=0;
    }else{
      c.currentAction=false;
      if(c.currentJump)c.currentDash=0;
    }
  }
  const DEFAULTS=Object.freeze({reaction:.05,lead:.10,guardGap:34,stealRange:46,stealInterval:.9,
    closeoutDash:175,jitterPeriod:.13,fakeWait:.28,shotDistance:535,twoDistance:155,releaseHeight:278});
  function update(c,dt,model){
    if(model?.schema!=='contextual-v1')return false;
    const p=c.player,o=c.opponent,b=c.ball,s=c.SIDE,w=c.width||800;
    const a={...DEFAULTS,...model.parameters};
    let st=c.__impossible;
    if(!st)st=c.__impossible={time:0,steal:0,fake:0,air:0,ground:0,flight:0,hadBall:false,jumpCommitted:false};
    st.time+=dt;st.steal=Math.max(0,st.steal-dt);st.fake=Math.max(0,st.fake-dt);
    if(st.probeAt!==undefined&&st.time-st.probeAt<.9&&!o.isGrounded)st.fakeBites=true;
    const gap=Math.abs(p.getX()-o.getX());
    const intent={move:c.currentMove,jump:c.currentJump,action:c.currentAction,skip:c.currentJumpSkip,dash:c.currentDash,pump:c.currentBlockOrPump};
    const superIntent=Boolean(p.readyForSuper&&(p.withBall||p.superID===1||(p.superID===3&&o.withBall)));
    c.currentJump=false;c.currentJumpSkip=false;c.currentAction=false;c.currentDash=0;c.currentBlockOrPump=false;
    c.currentSuper=superIntent;
    if(p.isSuperShot)return true;
    if(p.withBall&&superIntent){c.currentMove=2;return true;}
    if(p.withBall&&a.offenseMode===3){
      c.currentMove=intent.move;c.currentJump=intent.jump;c.currentAction=intent.action;
      c.currentJumpSkip=intent.skip;c.currentDash=intent.dash;c.currentBlockOrPump=intent.pump;
      const d=s===1?p.getX():w-p.getX();
      if(a.precisionAir&&!p.isGrounded&&p.canThrow){
        const takeoff=s===1?p.pointOfThrow:w-p.pointOfThrow;
        if(takeoff>=(s===1?p.threePointDistance:w-p.threePointDistance)){
          const target=Math.max(470,Math.min(495,takeoff-60));
          c.currentJumpSkip=false;c.currentAction=false;c.currentBlockOrPump=false;c.currentDash=0;
          if(d>target+3)c.currentMove=-s;
          else{
            c.currentMove=2;
            if(p.getY()<=285&&!activeBlockRisk(c))c.currentAction=true;
            else if(activeBlockRisk(c))c.currentMove=Math.sign(p.getX()-o.getX());
          }
        }
      }
      if(p.isGrounded&&d>(a.maxTakeoffDistance||575)&&(c.currentJump||c.currentAction||c.currentJumpSkip)){
        c.currentMove=-s;c.currentJump=false;c.currentAction=false;c.currentJumpSkip=false;
      }
      if(a.actionPriority&&p.isGrounded){
        const prime=root.__BS2019_DUEL__?.blockThreat(c,{shotRiskRange:105});
        const testFake=prime&&o.isGrounded&&(!st.fakeTested||st.fakeBites);
        if(c.currentBlockOrPump&&st.fake===0&&testFake){
          c.currentJump=false;c.currentAction=false;c.currentDash=0;c.currentJumpSkip=false;st.fake=1.2;
          st.fakeTested=true;st.probeAt=st.time;
        }else if(c.currentDash&&p.readyForDash&&(d>600||(d<450&&d>160)||!o.isGrounded||/steal/.test(o.state||''))){
          c.currentJump=false;c.currentAction=false;c.currentJumpSkip=false;c.currentBlockOrPump=false;
        }
        if(!testFake)c.currentBlockOrPump=false;
      }
      if(a.precisionTwo&&d>125&&d<460&&p.canThrow){
        if(p.isGrounded&&c.currentAction&&!c.currentBlockOrPump){
          c.currentAction=false;c.currentJump=true;c.currentJumpSkip=false;c.currentDash=0;c.currentMove=2;
        }else if(!p.isGrounded){
          c.currentMove=2;c.currentJumpSkip=false;c.currentDash=0;c.currentBlockOrPump=false;
          c.currentAction=p.getY()<=278&&!activeBlockRisk(c);
        }
      }
      return true;
    }
    if(p.withBall&&a.offenseMode!==1){
      st.hadBall=false;st.plan=null;
      c.currentMove=intent.move;c.currentJump=intent.jump;c.currentAction=intent.action;
      c.currentDash=intent.dash;c.currentBlockOrPump=intent.pump;
      const threat=root.__BS2019_DUEL__?.blockThreat(c,{shotRiskRange:105});
      if((c.currentAction||intent.skip)&&!superIntent){
        if(p.isGrounded){c.currentAction=false;c.currentJump=!threat;}
        else{
          c.currentAction=Boolean(p.canThrow&&p.getY()<=a.releaseHeight&&!threat);
          if(c.currentAction)c.currentMove=2;
        }
      }
      if(c.currentDash)note(c,'dashAttempts');
      if(c.currentBlockOrPump){c.currentJump=false;c.currentAction=false;c.currentDash=0;}
      else if(c.currentDash&&p.isGrounded){c.currentJump=false;c.currentAction=false;}
      return true;
    }
    if(!p.withBall){
      st.plan=null;st.hadBall=false;
      if(a.defenseMode===3){
        c.currentMove=intent.move;c.currentJump=intent.jump;c.currentAction=intent.action;c.currentDash=intent.dash;c.currentBlockOrPump=intent.pump;
        st.ground=o.withBall&&o.isGrounded?st.ground+dt:0;
        if(o.withBall&&o.isGrounded){
          c.currentJump=false;
          if(c.__duelDefense)c.__duelDefense.jumped=false;
          if(p.isGrounded&&p.canAct&&st.ground>.7&&gap<a.stealRange&&st.steal===0){c.currentAction=true;c.currentDash=0;st.steal=a.stealInterval;note(c,'stealAttempts');}
          if(p.isGrounded&&p.readyForDash&&gap>a.closeoutDash){c.currentDash=Math.sign(o.getX()+s*34-p.getX());c.currentAction=false;note(c,'dashAttempts');}
        }
        if(a.safeDefense)protectDefensiveActions(c,dt);
        return true;
      }
      if((a.defenseMode===1||a.defenseMode===4)&&model.defense){
        st.ground=o.withBall&&o.isGrounded?st.ground+dt:0;
        const handled=root.__BS2019_RESIDUAL_DEFENSE__?.defend(c,dt,model.defense);
        if(a.defenseMode===4)c.currentMove=intent.move;
        if(o.withBall&&o.isGrounded){
          if(c.currentJump&&c.__decisionStats)c.__decisionStats.defensiveJumps=Math.max(0,(c.__decisionStats.defensiveJumps||0)-1);
          c.currentJump=false;
          if(c.__duelDefense)c.__duelDefense.jumped=false;
          if(p.isGrounded&&p.canAct&&st.ground>.7&&gap<a.stealRange&&st.steal===0){c.currentAction=true;st.steal=a.stealInterval;note(c,'stealAttempts');}
          if(p.isGrounded&&p.readyForDash&&gap>a.closeoutDash){c.currentDash=Math.sign(o.getX()+s*34-p.getX());note(c,'dashAttempts');}
        }
        if(handled)return true;
      }
      if(o.withBall){
        st.flight=0;
        if(o.isGrounded){st.air=0;st.ground+=dt;st.jumpCommitted=false;}
        else{st.air+=dt;st.ground=0;}
        const target=clamp(o.getX()+s*a.guardGap+vx(o)*a.lead,20,w-20);
        c.currentMove=move(p,target);
        // A grounded pump is never evidence of a shot. Track visible takeoff.
        const rising=!o.isGrounded&&vy(o)<-40;
        const reachable=Math.abs(target-p.getX())<105;
        if(p.isGrounded&&rising&&reachable&&st.air>=a.reaction&&!st.jumpCommitted){
          c.currentJump=true;st.jumpCommitted=true;note(c,'defensiveJumps');
        }else if(p.isGrounded&&o.isGrounded&&p.canAct){
          const exposed=/pump|steal|landing/.test(o.state||'')||
            (Math.abs(vx(o))>70&&gap<42)||(st.ground>.65&&gap<36);
          if(gap<=a.stealRange&&exposed&&st.steal===0){
            c.currentAction=true;st.steal=a.stealInterval;note(c,'stealAttempts');
          }else if(Math.abs(target-p.getX())>a.closeoutDash&&p.readyForDash&&st.ground>.08){
            c.currentDash=Math.sign(target-p.getX());note(c,'dashAttempts');
          }
        }
        return true;
      }
      st.ground=0;st.air=0;
      if(b.state==='shooting'&&b.SIDE===o.SIDE){
        st.flight+=dt;
        const intercept=s===1?w-145:145;
        c.currentMove=move(p,intercept);
        const t=(p.getX()-b.getX())/(vx(b)||1);
        const by=b.getY()+vy(b)*t+365*t*t;
        const py=p.getY()+(Number(p.velY)||-540)*t+547*t*t;
        if(p.isGrounded&&!st.jumpCommitted&&t>=.025&&t<=.48&&by>py-105&&by<py+20){
          c.currentJump=true;st.jumpCommitted=true;note(c,'defensiveJumps');
        }
        if(p.isGrounded&&p.readyForDash&&Math.abs(intercept-p.getX())>150&&!c.currentJump){c.currentDash=Math.sign(intercept-p.getX());note(c,'dashAttempts');}
      }else{
        st.flight=0;st.jumpCommitted=false;
        const target=clamp(b.getX()+vx(b)*.15,20,w-20),height=p.getY()-b.getY();
        c.currentMove=move(p,target);
        if(p.isGrounded&&Math.abs(target-p.getX())<95&&height>55&&height<185&&vy(b)>-70)c.currentJump=true;
        else if(p.isGrounded&&p.readyForDash&&Math.abs(target-p.getX())>190){c.currentDash=Math.sign(target-p.getX());note(c,'dashAttempts');}
      }
      return true;
    }
    st.air=0;st.ground=0;st.jumpCommitted=false;
    const distance=s===1?p.getX():w-p.getX();
    const arc=s===1?p.threePointDistance:w-p.threePointDistance;
    if(!st.hadBall){
      st.hadBall=true;st.plan={three:distance>=arc+4,phase:'approach',time:0,anchor:distance};
    }
    const plan=st.plan;plan.time+=dt;
    if(superIntent){c.currentMove=2;return true;}
    const threat=root.__BS2019_DUEL__?.blockThreat(c,{shotRiskRange:105});
    const target=plan.three?a.shotDistance:a.twoDistance;
    if(p.isGrounded&&/steal/.test(o.state||'')&&gap<100){
      plan.three=distance>=arc;plan.takeoff=distance;c.currentMove=2;c.currentJump=true;return true;
    }
    if(!p.isGrounded){
      plan.phase='air';
      const releaseDistance=plan.three?Math.max(arc-60,(s===1?p.pointOfThrow:w-p.pointOfThrow)-60):a.twoDistance;
      c.currentMove=plan.three&&distance>releaseDistance+3?-s:2;
      // Native dispersion is lowest when the ball is high and feet are still.
      // Preserve the normal aiming/shot physics, including genuine blocks.
      if(p.canThrow&&distance<125&&p.getY()<315)c.currentAction=true;
      else if(p.canThrow&&p.getY()<=a.releaseHeight&&!threat&&c.currentMove===2&&Math.abs(vx(p))<12)c.currentAction=true;
      if(threat)note(c,'contestDeferrals');
      return true;
    }
    if(!plan.three&&distance<=a.twoDistance+10){
      c.currentMove=distance<60?s:2;c.currentJump=true;return true;
    }
    if(plan.phase==='air'){plan.phase='approach';plan.time=0;}
    if(plan.phase==='fake'){
      if(!o.isGrounded||/steal/.test(o.state||'')||plan.time>a.fakeWait){
        plan.driveTarget=plan.three?a.twoDistance:85;plan.three=false;plan.phase='drive';plan.time=0;
      }else{
        const direction=Math.floor(plan.time/a.jitterPeriod)%2?1:-1;
        c.currentMove=move(p,clamp((s===1?plan.anchor:w-plan.anchor)+direction*11,25,w-25),3);
        note(c,'jitterChanges');return true;
      }
    }
    if(plan.phase==='drive'){
      c.currentMove=-s;
      const driveTarget=plan.driveTarget||a.twoDistance;
      if(p.readyForDash&&distance>driveTarget+55&&(!o.isGrounded||gap<100)){
        c.currentDash=-s;note(c,'dashAttempts');
      }
      if(distance<=driveTarget+7){plan.phase='approach';plan.time=0;plan.target=driveTarget;}
      return true;
    }
    const shotTarget=plan.target||target;
    if(Math.abs(distance-shotTarget)>5){
      // Never retreat a long way to manufacture a three-point attempt.
      if(shotTarget>distance+24){plan.three=false;plan.phase='drive';return true;}
      c.currentMove=(shotTarget>distance?s:-s);
      if(p.readyForDash&&distance-shotTarget>105&&gap<100){c.currentDash=-s;note(c,'dashAttempts');}
      return true;
    }
    c.currentMove=2;
    if(threat&&distance>125){
      if(st.fake===0){
        c.currentBlockOrPump=true;st.fake=1.0;note(c,'pumpFakes');
        plan.phase='fake';plan.time=0;plan.anchor=distance;
      }else{plan.driveTarget=plan.three?a.twoDistance:85;plan.phase='drive';plan.three=false;plan.time=0;}
      note(c,'contestDeferrals');return true;
    }
    c.currentJump=true;
    return true;
  }
  root.__BS2019_IMPOSSIBLE__=Object.freeze({update,DEFAULTS});
})(typeof window==='undefined'?globalThis:window);
